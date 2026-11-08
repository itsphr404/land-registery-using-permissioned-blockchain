const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts } = hre;
const fs = require("fs"), os = require("os"), path = require("path");
const { deployPilot } = require("../scripts/lib/deployPilot");
const { checkDeployment } = require("../scripts/lib/checkDeployment");
const { grantRole } = require("../scripts/lib/grantRole");

describe("post-deploy tools (checkDeployment and grantRole)", function () {
  this.timeout(60000);
  async function deployed(roles = {}) {
    const signers = await ethers.getSigners();
    const dirs = [fs.mkdtempSync(path.join(os.tmpdir(), "pd-"))];
    const r = await deployPilot({ ethers, artifacts, signer: signers[0], expectedChainId: 31337, roles, outDirs: dirs });
    const deployment = JSON.parse(fs.readFileSync(path.join(dirs[0], "sepolia.json"), "utf8"));
    return { signers, deployment, r };
  }
  const check = (deployment, over = {}) => checkDeployment({ ethers, provider: ethers.provider, deployment, expectedChainId: 31337, ...over });

  describe("checkDeployment", () => {
    it("passes for a correct deployment and reports every check", async () => {
      const { signers, deployment } = await deployed({ registrar: [(await ethers.getSigners())[1].address] });
      const res = await check(deployment);
      expect(res.ok, JSON.stringify(res.lines.filter((l) => !l.ok))).to.equal(true);
      const text = res.lines.map((l) => l.text).join("\n");
      expect(text).to.match(/RoleManager\s+0x/);
      expect(text).to.match(/contract code found/);
      expect(text).to.match(/TitleEscrow holds the escrow role/);
      expect(text).to.match(/registrar role granted to/);
      expect(text).to.match(/Parcels registered so far: 0/);
    });

    it("fails when the connected chain is not the expected one", async () => {
      const { deployment } = await deployed();
      const res = await check(deployment, { expectedChainId: 11155111n });
      expect(res.ok).to.equal(false);
      expect(res.lines[0].ok).to.equal(false);
    });

    it("fails when the deployment file points at an address with no code", async () => {
      const { deployment } = await deployed();
      deployment.contracts.TitleEscrow.address = ethers.Wallet.createRandom().address;
      const res = await check(deployment);
      expect(res.ok).to.equal(false);
      expect(res.lines.some((l) => !l.ok && /NO CODE/.test(l.text))).to.equal(true);
    });

    it("fails when the contracts are not wired together (a LandRegistry from a different deployment)", async () => {
      const a = await deployed(), b = await deployed();
      a.deployment.contracts.LandRegistry = b.deployment.contracts.LandRegistry;
      const res = await check(a.deployment);
      expect(res.ok).to.equal(false);
      expect(res.lines.some((l) => !l.ok && /uses this (RoleManager|LandRegistry)/.test(l.text))).to.equal(true);
    });

    it("fails when a listed role was never granted", async () => {
      const { signers, deployment } = await deployed();
      deployment.roles.surveyor = [signers[5].address];
      const res = await check(deployment);
      expect(res.ok).to.equal(false);
      expect(res.lines.some((l) => !l.ok && /surveyor role granted/.test(l.text))).to.equal(true);
    });

    it("fails clearly (no crash) when an address entry is missing or invalid", async () => {
      const { deployment } = await deployed();
      deployment.contracts.DocumentAccess.address = "not-an-address";
      const res = await check(deployment);
      expect(res.ok).to.equal(false);
      expect(res.lines.some((l) => !l.ok && /DocumentAccess: missing or invalid address/.test(l.text))).to.equal(true);
    });
  });

  describe("grantRole", () => {
    it("the admin grants each role and the role is really set on-chain", async () => {
      const { signers, deployment } = await deployed();
      const rm = new ethers.Contract(deployment.contracts.RoleManager.address, deployment.contracts.RoleManager.abi, signers[0]);
      const logs = [];
      const r1 = await grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: signers[1].address, log: (m) => logs.push(m) });
      expect(r1.alreadyHeld).to.equal(false);
      expect(r1.hash).to.match(/^0x[0-9a-f]{64}$/);
      expect(await rm.isRegistrar(signers[1].address)).to.equal(true);
      await grantRole({ ethers, deployment, signer: signers[0], role: "surveyor", wallet: signers[2].address });
      await grantRole({ ethers, deployment, signer: signers[0], role: "court", wallet: signers[3].address });
      await grantRole({ ethers, deployment, signer: signers[0], role: "issuer", wallet: signers[4].address });
      expect(await rm.isSurveyor(signers[2].address)).to.equal(true);
      expect(await rm.isCourt(signers[3].address)).to.equal(true);
      expect(await rm.isIssuer(signers[4].address)).to.equal(true);
    });

    it("granting twice is a harmless no-op and sends no transaction", async () => {
      const { signers, deployment } = await deployed();
      await grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: signers[1].address });
      const nonce = await ethers.provider.getTransactionCount(signers[0].address);
      const r = await grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: signers[1].address });
      expect(r.alreadyHeld).to.equal(true);
      expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);
    });

    it("rejects unknown roles, bad addresses and the zero address before sending anything", async () => {
      const { signers, deployment } = await deployed();
      const nonce = await ethers.provider.getTransactionCount(signers[0].address);
      await expect(grantRole({ ethers, deployment, signer: signers[0], role: "boss", wallet: signers[1].address })).to.be.rejectedWith(/Unknown role/);
      await expect(grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: "nope" })).to.be.rejectedWith(/not a valid wallet/);
      await expect(grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: ethers.ZeroAddress })).to.be.rejectedWith(/not a valid wallet/);
      expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);
    });

    it("refuses a non-admin signer before sending anything", async () => {
      const { signers, deployment } = await deployed();
      const nonce = await ethers.provider.getTransactionCount(signers[5].address);
      await expect(grantRole({ ethers, deployment, signer: signers[5], role: "registrar", wallet: signers[1].address })).to.be.rejectedWith(/is not the admin/);
      expect(await ethers.provider.getTransactionCount(signers[5].address)).to.equal(nonce);
    });

    it("refuses to give one wallet two of registrar, surveyor and court, with a clear message and no transaction", async () => {
      const { signers, deployment } = await deployed();
      await grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: signers[1].address });
      const nonce = await ethers.provider.getTransactionCount(signers[0].address);
      await expect(grantRole({ ethers, deployment, signer: signers[0], role: "surveyor", wallet: signers[1].address })).to.be.rejectedWith(/already holds registrar/);
      expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);
    });

    it("refuses to make the admin wallet an official", async () => {
      const { signers, deployment } = await deployed();
      await expect(grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: signers[0].address })).to.be.rejectedWith(/admin wallet an official|Do not give the admin/);
    });

    it("accepts a lowercase address and stores the checksummed one", async () => {
      const { signers, deployment } = await deployed();
      const r = await grantRole({ ethers, deployment, signer: signers[0], role: "issuer", wallet: signers[6].address.toLowerCase() });
      expect(r.wallet).to.equal(signers[6].address);
    });

    it("after granting, checkDeployment still passes", async () => {
      const { signers, deployment } = await deployed();
      await grantRole({ ethers, deployment, signer: signers[0], role: "registrar", wallet: signers[1].address });
      expect((await check(deployment)).ok).to.equal(true);
    });
  });
});
