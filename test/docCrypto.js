const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

describe("docCrypto", function () {
    let crypto;

    function containsBytes(haystack, needle) {
        for (let start = 0; start <= haystack.length - needle.length; start++) {
            if (needle.every((byte, index) => haystack[start + index] === byte)) {
                return true;
            }
        }
        return false;
    }

    before(async function () {
        crypto = await import(pathToFileURL(path.resolve(__dirname, "../frontend/src/lib/docCrypto.js")).href);
    });

    it("round trips encrypted files and authenticates the envelope", async function () {
        const plaintext = new TextEncoder().encode("land registry document");
        const key = await crypto.generateFileKey();
        const first = await crypto.encryptFile(plaintext, key);
        const second = await crypto.encryptFile(plaintext, key);
        assert.deepEqual(await crypto.decryptFile(first, key), plaintext);
        assert.equal(first.length, plaintext.length + 28);
        assert.notDeepEqual(first, plaintext);
        assert.equal(containsBytes(first, plaintext), false);
        assert.notDeepEqual(first, second);

        const modified = first.slice();
        modified[modified.length - 1] ^= 1;
        await assert.rejects(() => crypto.decryptFile(modified, key));
    });

    it("rejects decryption with the wrong key", async function () {
        const key = await crypto.generateFileKey();
        const wrongKey = await crypto.generateFileKey();
        const envelope = await crypto.encryptFile(new Uint8Array([1, 2, 3]), key);
        await assert.rejects(() => crypto.decryptFile(envelope, wrongKey));
    });

    it("hashes original bytes", async function () {
        assert.equal(
            await crypto.sha256Bytes32("abc"),
            "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert.notEqual(await crypto.sha256Bytes32("abd"), await crypto.sha256Bytes32("abc"));
    });

    it("wraps a file key for only the intended reader", async function () {
        const reader = await crypto.generateUserKeyPair();
        const outsider = await crypto.generateUserKeyPair();
        const fileKey = await crypto.generateFileKey();
        const wrapped = await crypto.wrapFileKey(fileKey, reader.publicKey);
        assert.equal(wrapped.length, 256);
        const unwrapped = await crypto.unwrapFileKey(wrapped, reader.privateKey);
        const envelope = await crypto.encryptFile("x", fileKey);
        assert.deepEqual(await crypto.decryptFile(envelope, unwrapped), new TextEncoder().encode("x"));
        await assert.rejects(() => crypto.unwrapFileKey(wrapped, outsider.privateKey));
    });

    it("creates and unlocks a non-extractable vault key", async function () {
        const vault = await crypto.createVault("correct horse battery staple", 1000);
        assert.equal(vault.v, 1);
        assert.equal(vault.kdf, "PBKDF2-SHA256");
        assert.equal(crypto.vaultPublicKeyBytes(vault).length, 294);
        await assert.rejects(() => crypto.unlockVault(vault, "wrong password"));
        const privateKey = await crypto.unlockVault(vault, "correct horse battery staple");
        assert.equal(privateKey.extractable, false);
        const publicKey = await crypto.importPublicKey(crypto.vaultPublicKeyBytes(vault));
        const fileKey = await crypto.generateFileKey();
        const wrapped = await crypto.wrapFileKey(fileKey, publicKey);
        await crypto.unwrapFileKey(wrapped, privateKey);
    });

    it("supports key rotation while preserving the original file hash", async function () {
        const plaintext = new TextEncoder().encode("unchanged document");
        const oldKey = await crypto.generateFileKey();
        const newKey = await crypto.generateFileKey();
        const oldEnvelope = await crypto.encryptFile(plaintext, oldKey);
        const newEnvelope = await crypto.encryptFile(plaintext, newKey);
        const originalHash = await crypto.sha256Bytes32(plaintext);
        assert.equal(await crypto.sha256Bytes32(await crypto.decryptFile(oldEnvelope, oldKey)), originalHash);
        assert.equal(await crypto.sha256Bytes32(await crypto.decryptFile(newEnvelope, newKey)), originalHash);
        await assert.rejects(() => crypto.decryptFile(newEnvelope, oldKey));
        assert.deepEqual(await crypto.decryptFile(newEnvelope, newKey), plaintext);
        assert.deepEqual(await crypto.decryptFile(oldEnvelope, oldKey), plaintext);
    });

    it("round trips hexadecimal and base64 bytes", async function () {
        const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
        assert.deepEqual(crypto.fromHex(crypto.toHex(bytes)), bytes);
        assert.deepEqual(crypto.fromB64(crypto.toB64(bytes)), bytes);
    });
});
