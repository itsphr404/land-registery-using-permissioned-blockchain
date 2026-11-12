const subtle = globalThis.crypto?.subtle;

if (!subtle) {
    throw new Error("Web Crypto API is unavailable");
}

const textEncoder = new TextEncoder();

function asBytes(value) {
    if (typeof value === "string") {
        return textEncoder.encode(value);
    }
    if (value instanceof Uint8Array) {
        return value;
    }
    throw new TypeError("Expected a string or Uint8Array");
}

function copyBytes(value) {
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value.slice(0));
    }
    return new Uint8Array(asBytes(value));
}

export function toHex(bytes) {
    return Array.from(asBytes(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex) {
    if (typeof hex !== "string") {
        throw new TypeError("Invalid hexadecimal string");
    }
    const normalized = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
    if (normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) {
        throw new TypeError("Invalid hexadecimal string");
    }
    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

export function toB64(bytes) {
    const input = asBytes(bytes);
    let binary = "";
    for (const byte of input) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export function fromB64(value) {
    if (typeof value !== "string") {
        throw new TypeError("Expected a base64 string");
    }
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function sha256Bytes32(bytes) {
    const digest = new Uint8Array(await subtle.digest("SHA-256", asBytes(bytes)));
    return `0x${toHex(digest)}`;
}

export async function generateFileKey() {
    return subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptFile(bytes, key) {
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const ciphertext = new Uint8Array(await subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        asBytes(bytes)
    ));
    const envelope = new Uint8Array(iv.length + ciphertext.length);
    envelope.set(iv);
    envelope.set(ciphertext, iv.length);
    return envelope;
}

export async function decryptFile(envelope, key) {
    const input = asBytes(envelope);
    if (input.length < 12 + 16) {
        throw new Error("Invalid encrypted file envelope");
    }
    return new Uint8Array(await subtle.decrypt(
        { name: "AES-GCM", iv: input.slice(0, 12) },
        key,
        input.slice(12)
    ));
}

export async function generateUserKeyPair() {
    return subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["wrapKey", "unwrapKey"]
    );
}

export async function exportPublicKey(publicKey) {
    return new Uint8Array(await subtle.exportKey("spki", publicKey));
}

export async function importPublicKey(spki) {
    return subtle.importKey(
        "spki",
        copyBytes(spki),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["wrapKey"]
    );
}

function isCryptoKey(value) {
    return value !== null
        && typeof value === "object"
        && typeof value.type === "string"
        && value.algorithm
        && Array.isArray(value.usages);
}

function publicKeyBytes(value) {
    if (typeof value === "string") {
        return fromHex(value);
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (value instanceof Uint8Array) {
        return value;
    }
    return null;
}

export async function wrapFileKey(fileKey, publicKey) {
    if (!isCryptoKey(fileKey)) {
        throw new TypeError("wrapFileKey needs the file key as a CryptoKey");
    }
    if (!isCryptoKey(publicKey)) {
        const bytes = publicKeyBytes(publicKey);
        if (!bytes) {
            throw new TypeError("wrapFileKey needs the reader's public key as a CryptoKey, SPKI bytes, or 0x hex");
        }
        if (bytes.length === 0) {
            throw new Error("This reader has not registered an encryption key yet");
        }
        publicKey = await importPublicKey(bytes);
    }
    return new Uint8Array(await subtle.wrapKey(
        "raw",
        fileKey,
        publicKey,
        { name: "RSA-OAEP" }
    ));
}

export async function unwrapFileKey(wrapped, privateKey) {
    if (!isCryptoKey(privateKey)) {
        throw new TypeError("unwrapFileKey needs your unlocked vault key. Unlock the vault first");
    }
    const wrappedBytes = publicKeyBytes(wrapped);
    if (!wrappedBytes || wrappedBytes.length === 0) {
        throw new Error("There is no wrapped key to open (no access has been granted)");
    }
    return subtle.unwrapKey(
        "raw",
        wrappedBytes,
        privateKey,
        { name: "RSA-OAEP" },
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function createVault(password, iterations = 600000) {
    const keyPair = await generateUserKeyPair();
    const privateKey = new Uint8Array(await subtle.exportKey("pkcs8", keyPair.privateKey));
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(salt);
    globalThis.crypto.getRandomValues(iv);
    const passwordMaterial = await subtle.importKey(
        "raw",
        textEncoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    const wrappingKey = await subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        passwordMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    const ciphertext = new Uint8Array(await subtle.encrypt(
        { name: "AES-GCM", iv },
        wrappingKey,
        privateKey
    ));
    return {
        v: 1,
        kdf: "PBKDF2-SHA256",
        iterations,
        salt: toB64(salt),
        iv: toB64(iv),
        ct: toB64(ciphertext),
        publicKey: toB64(await exportPublicKey(keyPair.publicKey))
    };
}

export async function unlockVault(vault, password) {
    if (!vault || vault.v !== 1 || vault.kdf !== "PBKDF2-SHA256") {
        throw new Error("Invalid vault");
    }
    const passwordMaterial = await subtle.importKey(
        "raw",
        textEncoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    const wrappingKey = await subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: fromB64(vault.salt),
            iterations: vault.iterations,
            hash: "SHA-256"
        },
        passwordMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );
    const privateKey = await subtle.decrypt(
        { name: "AES-GCM", iv: fromB64(vault.iv) },
        wrappingKey,
        fromB64(vault.ct)
    );
    return subtle.importKey(
        "pkcs8",
        privateKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["unwrapKey"]
    );
}

export function vaultPublicKeyBytes(vault) {
    return fromB64(vault.publicKey);
}
