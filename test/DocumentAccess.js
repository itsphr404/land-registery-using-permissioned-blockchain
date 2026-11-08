const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll } = require("../scripts/lib/deployAll");

describe("DocumentAccess", function () {
    async function fixture() {
        const deployment = await deployAll();
        const { registry, documentAccess, signers } = deployment;
        const surveyor = registry.connect(signers[2]);
        const registrar = registry.connect(signers[1]);
        const alice = registry.connect(signers[4]);
        const bob = registry.connect(signers[5]);

        async function createParcel(owners, shares) {
            const tx = await alice.submitParcel(
                owners.map(owner => owner.address),
                shares,
                ethers.id(`document-${Date.now()}-${Math.random()}`),
                "cid"
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "ParcelSubmitted");
            const parcelId = event.args.parcelId;
            await surveyor.verifySurvey(parcelId);
            await registrar.approveRegistration(parcelId);
            return parcelId;
        }

        const key = size => ethers.hexlify(ethers.randomBytes(size));
        const wrappedKey = key(256);
        const register = async account =>
            documentAccess.connect(account).registerEncryptionKey(key(294));

        return {
            ...deployment,
            createParcel,
            key,
            wrappedKey,
            register,
            alice: signers[4],
            bob: signers[5],
            carol: signers[6],
            dave: signers[7]
        };
    }

    it("rejects a zero registry", async function () {
        const DocumentAccess = await ethers.getContractFactory("DocumentAccess");
        await expect(DocumentAccess.deploy(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(DocumentAccess, "ZeroAddress");
    });

    it("registers and replaces encryption keys", async function () {
        const { documentAccess, alice, key } = await loadFixture(fixture);
        const first = key(294);
        await expect(documentAccess.connect(alice).registerEncryptionKey(first))
            .to.emit(documentAccess, "EncryptionKeyRegistered")
            .withArgs(alice.address, ethers.keccak256(first));
        const second = key(294);
        await documentAccess.connect(alice).registerEncryptionKey(second);
        expect(await documentAccess.encryptionKeyOf(alice.address)).to.equal(second);
        await expect(documentAccess.connect(alice).registerEncryptionKey("0x"))
            .to.be.revertedWithCustomError(documentAccess, "EmptyKey");
        await expect(documentAccess.connect(alice).registerEncryptionKey(key(1025)))
            .to.be.revertedWithCustomError(documentAccess, "KeyTooLarge")
            .withArgs(1025, 1024);
    });

    it("requests access only with a registered key and validates the parcel", async function () {
        const { documentAccess, createParcel, register, alice, bob, registry } = await loadFixture(fixture);
        const parcelId = await createParcel([alice], [100]);
        await expect(documentAccess.connect(bob).requestAccess(parcelId))
            .to.be.revertedWithCustomError(documentAccess, "NoEncryptionKey")
            .withArgs(bob.address);
        await register(alice);
        await expect(documentAccess.connect(alice).requestAccess(parcelId))
            .to.emit(documentAccess, "AccessRequested")
            .withArgs(parcelId, alice.address);
        await expect(documentAccess.connect(alice).requestAccess(999))
            .to.be.revertedWithCustomError(registry, "ParcelNotFound")
            .withArgs(999);
    });

    it("grants, overwrites, isolates, and revokes current-epoch access", async function () {
        const { documentAccess, createParcel, register, alice, bob, carol, wrappedKey, key } =
            await loadFixture(fixture);
        const parcelId = await createParcel([alice], [100]);
        const otherParcel = await createParcel([alice], [100]);
        await register(alice);
        await register(bob);
        await register(carol);

        await expect(documentAccess.connect(alice).grantAccess(parcelId, bob.address, wrappedKey))
            .to.emit(documentAccess, "AccessGranted")
            .withArgs(parcelId, 0, bob.address, alice.address);
        expect(await documentAccess.hasAccess(parcelId, bob.address)).to.be.true;
        expect(await documentAccess.hasAccess(otherParcel, bob.address)).to.be.false;
        const replacement = key(256);
        await documentAccess.connect(alice).grantAccess(parcelId, bob.address, replacement);
        expect(await documentAccess.getWrappedKey(parcelId, bob.address)).to.equal(replacement);
        await expect(documentAccess.connect(alice).revokeAccess(parcelId, bob.address))
            .to.emit(documentAccess, "AccessRevoked")
            .withArgs(parcelId, 0, bob.address, alice.address);
        await expect(documentAccess.connect(alice).revokeAccess(parcelId, bob.address))
            .to.be.revertedWithCustomError(documentAccess, "NoAccess")
            .withArgs(parcelId, bob.address);
    });

    it("grants batches atomically and supports co-owners", async function () {
        const { documentAccess, createParcel, register, alice, bob, carol, dave, wrappedKey } =
            await loadFixture(fixture);
        const parcelId = await createParcel([alice, bob], [60, 40]);
        await register(alice);
        await register(bob);
        await register(carol);
        await register(dave);
        await expect(documentAccess.connect(bob).grantAccessBatch(
            parcelId,
            [carol.address, dave.address],
            [wrappedKey, wrappedKey]
        )).to.emit(documentAccess, "AccessGranted");
        await expect(documentAccess.connect(alice).grantAccessBatch(
            parcelId,
            [carol.address, dave.address],
            [wrappedKey]
        )).to.be.revertedWithCustomError(documentAccess, "ArrayLengthMismatch");
        await expect(documentAccess.connect(alice).grantAccessBatch(parcelId, [], []))
            .to.be.revertedWithCustomError(documentAccess, "EmptyBatch");
        await expect(documentAccess.connect(alice).grantAccessBatch(
            parcelId,
            Array(21).fill(carol.address),
            Array(21).fill(wrappedKey)
        )).to.be.revertedWithCustomError(documentAccess, "BatchTooLarge");
        await expect(documentAccess.connect(alice).grantAccessBatch(
            parcelId,
            [carol.address, dave.address],
            [wrappedKey, "0x"]
        )).to.be.revertedWithCustomError(documentAccess, "EmptyKey");
        expect(await documentAccess.hasAccess(parcelId, dave.address)).to.be.true;
    });

    it("rotates epochs atomically and clears old readers", async function () {
        const { documentAccess, createParcel, register, alice, bob, carol, wrappedKey, key } =
            await loadFixture(fixture);
        const parcelId = await createParcel([alice], [100]);
        await register(alice);
        await register(bob);
        await register(carol);
        await documentAccess.connect(alice).grantAccess(parcelId, bob.address, wrappedKey);
        await expect(documentAccess.connect(alice).rotateDocument(
            parcelId,
            "cid-2",
            [carol.address],
            [key(256)]
        )).to.emit(documentAccess, "DocumentRotated").withArgs(parcelId, 1, "cid-2", alice.address);
        expect(await documentAccess.epochOf(parcelId)).to.equal(1);
        expect(await documentAccess.rotatedCidOf(parcelId)).to.equal("cid-2");
        expect(await documentAccess.hasAccess(parcelId, bob.address)).to.be.false;
        expect(await documentAccess.hasAccess(parcelId, carol.address)).to.be.true;
        await expect(documentAccess.connect(alice).rotateDocument(parcelId, "cid-3", [], []))
            .to.be.revertedWithCustomError(documentAccess, "EmptyBatch");
        expect(await documentAccess.epochOf(parcelId)).to.equal(1);
    });
});
