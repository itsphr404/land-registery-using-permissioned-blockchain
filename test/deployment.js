const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll } = require("../scripts/lib/deployAll");

describe("Deployment Integration", function () {
    async function fixture() {
        return await deployAll();
    }

    it("registry.roleManager() equals the RoleManager address", async function () {
        const { roleManager, registry } = await loadFixture(fixture);
        expect(await registry.roleManager()).to.equal(await roleManager.getAddress());
    });

    it("escrow.roleManager() and escrow.registry() are correct", async function () {
        const { roleManager, registry, escrow } = await loadFixture(fixture);
        expect(await escrow.roleManager()).to.equal(await roleManager.getAddress());
        expect(await escrow.registry()).to.equal(await registry.getAddress());
    });

    it("admin holds DEFAULT_ADMIN_ROLE", async function () {
        const { roleManager, signers } = await loadFixture(fixture);
        const adminRole = await roleManager.DEFAULT_ADMIN_ROLE();
        expect(await roleManager.hasRole(adminRole, signers[0].address)).to.be.true;
    });

    it("account 1 holds REGISTRAR_ROLE", async function () {
        const { roleManager, signers } = await loadFixture(fixture);
        const registrarRole = await roleManager.REGISTRAR_ROLE();
        expect(await roleManager.hasRole(registrarRole, signers[1].address)).to.be.true;
    });

    it("account 2 holds SURVEYOR_ROLE", async function () {
        const { roleManager, signers } = await loadFixture(fixture);
        const surveyorRole = await roleManager.SURVEYOR_ROLE();
        expect(await roleManager.hasRole(surveyorRole, signers[2].address)).to.be.true;
    });

    it("account 3 holds COURT_ROLE", async function () {
        const { roleManager, signers } = await loadFixture(fixture);
        const courtRole = await roleManager.COURT_ROLE();
        expect(await roleManager.hasRole(courtRole, signers[3].address)).to.be.true;
    });

    it("account 8 holds ISSUER_ROLE", async function () {
        const { roleManager, signers } = await loadFixture(fixture);
        const issuerRole = await roleManager.ISSUER_ROLE();
        expect(await roleManager.hasRole(issuerRole, signers[8].address)).to.be.true;
    });

    it("escrow contract holds ESCROW_ROLE", async function () {
        const { roleManager, escrow } = await loadFixture(fixture);
        const escrowRole = await roleManager.ESCROW_ROLE();
        const escrowAddr = await escrow.getAddress();
        expect(await roleManager.hasRole(escrowRole, escrowAddr)).to.be.true;
    });
});

describe("End-to-End Sale Flow", function () {
    async function fixture() {
        return await deployAll();
    }

    it("Alice submits, Surveyor verifies, Registrar approves, Alice consents, lists for 1 ether, Dave deposits, Alice approves, Registrar approves, Dave owns 100%, Alice withdraws 1 ether", async function () {
        const { roleManager, registry, escrow, signers } = await loadFixture(fixture);

        const admin = signers[0];
        const registrar = signers[1];
        const surveyor = signers[2];
        const alice = signers[4];   // Alice
        const dave = signers[7];   // Dave

        const price = ethers.parseEther("1");

        // 1. Alice submits a parcel (sole owner)
        const submitTx = await registry.connect(alice).submitParcel(
            [alice.address],
            [100],
            ethers.id("deed"),
            "QmTestCid"
        );
        const submitReceipt = await submitTx.wait();
        const submitEvent = submitReceipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const parcelId = submitEvent.args.parcelId;

        // 2. Surveyor verifies
        await registry.connect(surveyor).verifySurvey(parcelId);
        expect(await registry.getStatus(parcelId)).to.equal(2); // SurveyVerified

        // 3. Registrar approves
        await registry.connect(registrar).approveRegistration(parcelId);
        expect(await registry.getStatus(parcelId)).to.equal(3); // Registered

        // 4. Alice consents to sale
        await registry.connect(alice).consentToSale(parcelId);
        expect(await registry.consentCount(parcelId)).to.equal(1);

        // 5. Alice lists for 1 ether via escrow
        await escrow.connect(alice).listParcel(parcelId, price);
        expect(await registry.getStatus(parcelId)).to.equal(4); // UnderSale

        // 6. Dave deposits 1 ether
        await escrow.connect(dave).deposit(parcelId, { value: price });

        // 7. Alice approves as seller
        await escrow.connect(alice).approveAsSeller(parcelId);

        // 8. Registrar approves
        await escrow.connect(registrar).approveAsRegistrar(parcelId);

        // 9. Verify Dave owns the parcel at 100%
        expect(await registry.getStatus(parcelId)).to.equal(3); // Registered
        const [owners, shares] = await registry.getOwners(parcelId);
        expect(owners.length).to.equal(1);
        expect(owners[0]).to.equal(dave.address);
        expect(shares[0]).to.equal(100);

        // 10. Alice withdraws 1 ether
        const beforeBalance = await ethers.provider.getBalance(alice.address);
        const withdrawTx = await escrow.connect(alice).withdraw();
        const withdrawReceipt = await withdrawTx.wait();
        const gasUsed = withdrawReceipt.gasUsed * withdrawReceipt.gasPrice;
        const afterBalance = await ethers.provider.getBalance(alice.address);

        // Balance should increase by ~1 ether minus gas
        expect(afterBalance - beforeBalance + gasUsed).to.be.closeTo(price, ethers.parseEther("0.01"));
    });
});