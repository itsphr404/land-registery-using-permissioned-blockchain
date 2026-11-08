// DEV store only: this is not IPFS and must not be used as a production store.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const ID_PATTERN = /^dev-[0-9a-f]{64}$/;

function storeDir() {
    return process.env.DEV_IPFS_DIR || path.join(ROOT, ".dev-ipfs");
}

async function put(buf) {
    const bytes = Buffer.from(buf);
    const id = `dev-${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    await fs.mkdir(storeDir(), { recursive: true });
    await fs.writeFile(path.join(storeDir(), id), bytes);
    return id;
}

async function get(id) {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        throw new Error("invalid dev IPFS id");
    }
    const bytes = await fs.readFile(path.join(storeDir(), id));
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actual !== id.slice(4)) {
        throw new Error("stored content does not match its id");
    }
    return bytes;
}

module.exports = { put, get, ID_PATTERN };
