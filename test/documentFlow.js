const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { ethers } = require("hardhat");
const { deployAll } = require("../scripts/lib/deployAll");
const { createServer } = require("../scripts/dev-ipfs");
const devStore = require("../scripts/lib/devIpfsStore");

describe("Encrypted document flow", function () {
    let crypto;
    let ipfs;
    let manifest;

    before(async function () {
        crypto = await import(pathToFileURL(path.resolve(__dirname, "../frontend/src/lib/docCrypto.js")).href);
        ipfs = await import(pathToFileURL(path.resolve(__dirname, "../frontend/src/lib/ipfs.js")).href);
        manifest = await import(pathToFileURL(path.resolve(__dirname, "../frontend/src/lib/manifest.js")).href);
    });

    it("stores, verifies, shares, and rotates an encrypted document", async function () {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), "land-registry-ipfs-"));
        const previousDirectory = process.env.DEV_IPFS_DIR;
        process.env.DEV_IPFS_DIR = directory;
        const server = createServer();
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        const port = server.address().port;
        const storage = ipfs.createStorage({ mode: "dev", devUrl: `http://127.0.0.1:${port}` });

        try {
            const { registry, documentAccess, signers } = await loadFixture(deployAll);
            const alice = signers[4];
            const surveyor = signers[2];
            const registrar = signers[1];
            const eve = signers[9];
            const vaults = await Promise.all([
                crypto.createVault("alice", 1000),
                crypto.createVault("surveyor", 1000),
                crypto.createVault("registrar", 1000),
                crypto.createVault("eve", 1000)
            ]);
            const publicKeys = vaults.map(crypto.vaultPublicKeyBytes);

            for (let i = 0; i < publicKeys.length; i++) {
                await (await documentAccess.connect([alice, surveyor, registrar, eve][i])
                    .registerEncryptionKey(publicKeys[i])).wait();
            }

            const plaintext = new TextEncoder().encode("CONFIDENTIAL DEED TEXT");
            const docHash = await crypto.sha256Bytes32(plaintext);
            const fileKey = await crypto.generateFileKey();
            const ciphertext = await crypto.encryptFile(plaintext, fileKey);
            const fileCid = await storage.upload(ciphertext);
            const manifestBytes = manifest.buildManifest({
                area: "North",
                addr: "1 Registry Lane",
                size: 100,
                cell: "A1",
                docCid: fileCid,
                mime: "text/plain",
                bytes: plaintext.length
            });
            const manifestCid = await storage.upload(manifestBytes);
            const parsed = manifest.parseManifest(await storage.download(manifestCid));
            assert.equal(parsed.doc.cid, fileCid);
            assert.equal(parsed.doc.bytes, plaintext.length);
            assert.equal(new TextDecoder().decode(manifestBytes).includes("CONFIDENTIAL DEED TEXT"), false);
            assert.equal(new TextDecoder().decode(manifestBytes).includes("file-name.txt"), false);

            const submit = await registry.connect(alice).submitParcel(
                [alice.address],
                [100],
                docHash,
                manifestCid
            );
            const submitReceipt = await submit.wait();
            const submitted = submitReceipt.logs.find(log => log.fragment?.name === "ParcelSubmitted");
            const parcelId = submitted.args.parcelId;

            const wrapped = [];
            for (const publicKey of publicKeys.slice(0, 3)) {
                wrapped.push(await crypto.wrapFileKey(fileKey, await crypto.importPublicKey(publicKey)));
            }
            await (await documentAccess.connect(alice).grantAccessBatch(
                parcelId,
                [alice.address, surveyor.address, registrar.address],
                wrapped
            )).wait();

            const surveyorPrivateKey = await crypto.unlockVault(vaults[1], "surveyor");
            const surveyorKey = await crypto.unwrapFileKey(
                crypto.fromHex((await documentAccess.getWrappedKey(parcelId, surveyor.address)).slice(2)),
                surveyorPrivateKey
            );
            const downloaded = await storage.download(fileCid);
            assert.equal(await crypto.sha256Bytes32(await crypto.decryptFile(downloaded, surveyorKey)), docHash);
            assert.equal(await registry.verifyDocument(parcelId, docHash), true);
            const version = await registry.getVersion(parcelId, 0);
            assert.equal(version.cid, manifestCid);
            assert.equal(version.docHash, docHash);

            const outsiderBytes = await storage.download(fileCid);
            assert.equal(new TextDecoder().decode(outsiderBytes).includes("CONFIDENTIAL DEED TEXT"), false);
            assert.equal(await documentAccess.hasAccess(parcelId, eve.address), false);
            const evePrivateKey = await crypto.unlockVault(vaults[3], "eve");
            const randomKey = await crypto.generateFileKey();
            await assert.rejects(() => crypto.decryptFile(outsiderBytes, randomKey));
            await assert.rejects(() => crypto.unwrapFileKey(wrapped[1], evePrivateKey));
            await assert.rejects(() => crypto.unlockVault(vaults[3], "wrong"));
            assert.equal(await registry.verifyDocument(parcelId, await crypto.sha256Bytes32("forged")), false);

            const diskPath = path.join(directory, fileCid);
            const originalDiskBytes = await fs.readFile(diskPath);
            await fs.writeFile(diskPath, Buffer.from("tampered"));
            await assert.rejects(() => devStore.get(fileCid), /stored content does not match its id/);
            await fs.writeFile(diskPath, originalDiskBytes);

            const rotatedKey = await crypto.generateFileKey();
            const rotatedCiphertext = await crypto.encryptFile(plaintext, rotatedKey);
            const rotatedCid = await storage.upload(rotatedCiphertext);
            const rotatedWrapped = [
                await crypto.wrapFileKey(rotatedKey, await crypto.importPublicKey(publicKeys[0])),
                await crypto.wrapFileKey(rotatedKey, await crypto.importPublicKey(publicKeys[2]))
            ];
            await (await documentAccess.connect(alice).rotateDocument(
                parcelId,
                rotatedCid,
                [alice.address, registrar.address],
                rotatedWrapped
            )).wait();
            assert.equal(await documentAccess.hasAccess(parcelId, surveyor.address), false);
            const rotatedBytes = await storage.download(rotatedCid);
            await assert.rejects(() => crypto.decryptFile(rotatedBytes, surveyorKey));
            const registrarPrivateKey = await crypto.unlockVault(vaults[2], "registrar");
            const registrarKey = await crypto.unwrapFileKey(
                crypto.fromHex((await documentAccess.getWrappedKey(parcelId, registrar.address)).slice(2)),
                registrarPrivateKey
            );
            assert.equal(
                await crypto.sha256Bytes32(await crypto.decryptFile(rotatedBytes, registrarKey)),
                docHash
            );
            await assert.rejects(() => devStore.get("../" + fileCid));
        } finally {
            await new Promise(resolve => server.close(resolve));
            if (previousDirectory === undefined) delete process.env.DEV_IPFS_DIR;
            else process.env.DEV_IPFS_DIR = previousDirectory;
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
