const { expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { deployPilot, requiredBalance, validateRoles } = require("../scripts/lib/deployPilot");

describe("deployPilot", function () {
  let signers;
  let admin;
  let roleAddresses;

  beforeEach(async function () {
    signers = await ethers.getSigners();
    [admin] = signers;
    roleAddresses = {
      registrars: [signers[1].address],
      surveyors: [signers[2].address],
      courts: [signers[3].address],
      issuers: [signers[1].address],
    };
  });

  function outputDirs() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-pilot-"));
    return {
      root,
      dirs: [path.join(root, "one"), path.join(root, "two")],
    };
  }

  async function deploy(options = {}) {
    const outputs = outputDirs();
    const deployment = await deployPilot({
      ethers,
      artifacts,
      signer: admin,
      expectedChainId: 31337n,
      roles: roleAddresses,
      minBalanceWei: 0n,
      outDirs: outputs.dirs,
      name: "test",
      ...options,
    });
    return { deployment, outputs };
  }

  it("refuses the wrong chain before changing the nonce", async function () {
    const nonce = await ethers.provider.getTransactionCount(admin.address);
    await expect(deployPilot({
      ethers,
      artifacts,
      signer: admin,
      expectedChainId: 1n,
      outDirs: [os.tmpdir()],
    })).to.be.rejectedWith("Refusing to deploy: connected to chain 31337, expected 1.");
    expect(await ethers.provider.getTransactionCount(admin.address)).to.equal(nonce);
  });

  it("calculates the default requirement from 5.5M gas and the fee", async function () {
    const feeData = await ethers.provider.getFeeData();
    const fee = feeData.maxFeePerGas || feeData.gasPrice || 10_000_000_000n;
    const expected = (5_500_000n * fee * 3n) / 2n;
    expect(await requiredBalance(ethers.provider)).to.equal(
      expected > 50_000_000_000_000_000n ? expected : 50_000_000_000_000_000n,
    );
    await expect(deployPilot({
      ethers,
      artifacts,
      signer: admin,
      expectedChainId: 31337n,
      roles: roleAddresses,
      minBalanceWei: (await ethers.provider.getBalance(admin.address)) + 1n,
      outDirs: [os.tmpdir()],
    })).to.be.rejectedWith("requirement");
  });

  it("uses the 0.05 ETH floor when the fee estimate is low", async function () {
    const provider = {
      getFeeData: async () => ({ maxFeePerGas: 1n }),
    };
    expect(await requiredBalance(provider)).to.equal(50_000_000_000_000_000n);
  });

  it("rejects invalid, zero, and conflicting roles before transactions", function () {
    expect(() => validateRoles({ registrars: ["invalid"] })).to.throw("Invalid");
    expect(() => validateRoles({ courts: [ethers.ZeroAddress] })).to.throw("Zero address");
    expect(() => validateRoles({
      registrars: [signers[1].address],
      courts: [signers[1].address],
    })).to.throw("Conflicting roles");
    expect(() => validateRoles({ registrars: [admin.address] }, admin.address))
      .to.throw("admin cannot");
    expect(() => validateRoles({ registrars: [signers[1].address], issuers: [signers[1].address] }))
      .not.to.throw();
  });

  it("deploys and wires all contracts and roles", async function () {
    const { deployment, outputs } = await deploy();
    expect(deployment.chainId).to.equal(31337);
    expect(deployment.deployBlock).to.be.a("number");
    expect(deployment).not.to.have.property("accounts");
    expect(JSON.stringify(deployment)).not.to.match(/0x[0-9a-fA-F]{64}/);
    expect(deployment.admin).to.equal(admin.address);
    expect(fs.readFileSync(path.join(outputs.dirs[0], "test.json"), "utf8"))
      .to.equal(fs.readFileSync(path.join(outputs.dirs[1], "test.json"), "utf8"));

    const roleManager = await ethers.getContractAt("RoleManager", deployment.contracts.RoleManager.address);
    expect(await roleManager.isEscrow(deployment.contracts.TitleEscrow.address)).to.equal(true);
    expect(await roleManager.isRegistrar(signers[1].address)).to.equal(true);
    expect(await roleManager.isSurveyor(signers[2].address)).to.equal(true);
    expect(await roleManager.isCourt(signers[3].address)).to.equal(true);
    expect(await roleManager.isIssuer(signers[1].address)).to.equal(true);
    expect(await roleManager.hasRole(await roleManager.REGISTRAR_ROLE(), admin.address)).to.equal(false);
    expect(deployment.contracts.RoleManager.abi).to.be.an("array").that.is.not.empty;
    fs.rmSync(outputs.root, { recursive: true, force: true });
  });

  it("refuses a second deployment and creates one backup with force", async function () {
    const first = await deploy();
    await expect(deploy({
      outDirs: first.outputs.dirs,
      name: "test",
    })).to.be.rejectedWith("Deployment already exists");
    await deploy({
      outDirs: first.outputs.dirs,
      name: "test",
      force: true,
    });
    for (const directory of first.outputs.dirs) {
      const files = fs.readdirSync(directory);
      expect(files.filter((file) => file.endsWith(".bak.json"))).to.have.length(1);
    }
    fs.rmSync(first.outputs.root, { recursive: true, force: true });
  });
});
