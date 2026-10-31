const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BaselineRegistry", function () {
    async function fixture() {
        const [authority, alice, bob, carol, attacker] = await ethers.getSigners();

        const BaselineRegistry = await ethers.getContractFactory("BaselineRegistry");
        const registry = await BaselineRegistry.deploy(authority.address);
        await registry.waitForDeployment();

        return { registry, authority, alice, bob, carol, attacker };
    }

    describe("DEPLOYMENT", function () {
        it("stores authority address", async function () {
            const { registry, authority } = await loadFixture(fixture);
            expect(await registry.authority()).to.equal(authority.address);
        });

        it("reverts ZeroAddress when authority is zero", async function () {
            const BaselineRegistry = await ethers.getContractFactory("BaselineRegistry");
            await expect(BaselineRegistry.deploy(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(BaselineRegistry, "ZeroAddress");
        });

        it("parcelCount starts at 0", async function () {
            const { registry } = await loadFixture(fixture);
            expect(await registry.parcelCount()).to.equal(0);
        });
    });

    describe("REGISTER", function () {
        it("authority registers and IDs increment", async function () {
            const { registry, authority, alice } = await loadFixture(fixture);

            const tx1 = await registry.connect(authority).registerParcel(alice.address, ethers.id("deed1"), "QmCid1");
            await expect(tx1).to.emit(registry, "ParcelRegistered").withArgs(1, alice.address, ethers.id("deed1"), "QmCid1");

            const tx2 = await registry.connect(authority).registerParcel(alice.address, ethers.id("deed2"), "QmCid2");
            await expect(tx2).to.emit(registry, "ParcelRegistered").withArgs(2, alice.address, ethers.id("deed2"), "QmCid2");

            expect(await registry.parcelCount()).to.equal(2);
            expect(await registry.ownerOf(1)).to.equal(alice.address);
            expect(await registry.ownerOf(2)).to.equal(alice.address);
        });

        it("reverts NotAuthority for non-authority registering", async function () {
            const { registry, alice, bob } = await loadFixture(fixture);
            await expect(registry.connect(alice).registerParcel(bob.address, ethers.id("deed"), "QmCid"))
                .to.be.revertedWithCustomError(registry, "NotAuthority");
        });

        it("reverts ZeroAddress when owner is zero", async function () {
            const { registry, authority } = await loadFixture(fixture);
            await expect(registry.connect(authority).registerParcel(ethers.ZeroAddress, ethers.id("deed"), "QmCid"))
                .to.be.revertedWithCustomError(registry, "ZeroAddress");
        });
    });

    describe("TRANSFER", function () {
        it("authority transfers and ownership changes", async function () {
            const { registry, authority, alice, bob } = await loadFixture(fixture);

            await registry.connect(authority).registerParcel(alice.address, ethers.id("deed"), "QmCid");
            expect(await registry.ownerOf(1)).to.equal(alice.address);

            await expect(registry.connect(authority).transferParcel(1, bob.address))
                .to.emit(registry, "OwnershipTransferred").withArgs(1, alice.address, bob.address);

            expect(await registry.ownerOf(1)).to.equal(bob.address);
        });

        it("reverts NotAuthority for non-authority transferring", async function () {
            const { registry, authority, alice, bob } = await loadFixture(fixture);
            await registry.connect(authority).registerParcel(alice.address, ethers.id("deed"), "QmCid");
            await expect(registry.connect(alice).transferParcel(1, bob.address))
                .to.be.revertedWithCustomError(registry, "NotAuthority");
        });

        it("reverts ParcelNotFound for unknown parcel", async function () {
            const { registry, authority } = await loadFixture(fixture);
            await expect(registry.connect(authority).transferParcel(999, ethers.Wallet.createRandom().address))
                .to.be.revertedWithCustomError(registry, "ParcelNotFound").withArgs(999);
        });

        it("reverts ZeroAddress when newOwner is zero", async function () {
            const { registry, authority, alice } = await loadFixture(fixture);
            await registry.connect(authority).registerParcel(alice.address, ethers.id("deed"), "QmCid");
            await expect(registry.connect(authority).transferParcel(1, ethers.ZeroAddress))
                .to.be.revertedWithCustomError(registry, "ZeroAddress");
        });
    });

    describe("OWNER OF", function () {
        it("reverts ParcelNotFound for unknown ID", async function () {
            const { registry } = await loadFixture(fixture);
            await expect(registry.ownerOf(999))
                .to.be.revertedWithCustomError(registry, "ParcelNotFound").withArgs(999);
        });
    });

    describe("VERIFY DOCUMENT", function () {
        it("returns true for the original hash", async function () {
            const { registry, authority, alice } = await loadFixture(fixture);
            const docHash = ethers.id("deed");
            await registry.connect(authority).registerParcel(alice.address, docHash, "QmCid");
            expect(await registry.verifyDocument(1, docHash)).to.be.true;
        });

        it("returns false for a forged hash", async function () {
            const { registry, authority, alice } = await loadFixture(fixture);
            await registry.connect(authority).registerParcel(alice.address, ethers.id("deed"), "QmCid");
            expect(await registry.verifyDocument(1, ethers.id("forged"))).to.be.false;
        });

        it("reverts ParcelNotFound for unknown ID", async function () {
            const { registry } = await loadFixture(fixture);
            await expect(registry.verifyDocument(999, ethers.id("deed")))
                .to.be.revertedWithCustomError(registry, "ParcelNotFound").withArgs(999);
        });
    });

    describe("WEAKNESS", function () {
        it("WEAKNESS: the authority can transfer a parcel without the owner's consent", async function () {
            const { registry, authority, alice, bob } = await loadFixture(fixture);

            // Alice owns parcel 1
            await registry.connect(authority).registerParcel(alice.address, ethers.id("deed"), "QmCid");
            expect(await registry.ownerOf(1)).to.equal(alice.address);

            // Authority transfers to Bob WITHOUT Alice's consent
            await registry.connect(authority).transferParcel(1, bob.address);
            expect(await registry.ownerOf(1)).to.equal(bob.address);

            // This demonstrates the weakness: no owner consent required
        });

        it("WEAKNESS: the same parcel can be transferred to two different buyers in a row", async function () {
            const { registry, authority, alice, bob, carol } = await loadFixture(fixture);

            // Alice owns parcel 1
            await registry.connect(authority).registerParcel(alice.address, ethers.id("deed"), "QmCid");
            expect(await registry.ownerOf(1)).to.equal(alice.address);

            // Authority transfers to Bob
            await registry.connect(authority).transferParcel(1, bob.address);
            expect(await registry.ownerOf(1)).to.equal(bob.address);

            // Authority immediately transfers to Carol (double sale)
            await registry.connect(authority).transferParcel(1, carol.address);
            expect(await registry.ownerOf(1)).to.equal(carol.address);

            // This demonstrates the weakness: no escrow, no locking, no consent - double sale possible
        });
    });
});