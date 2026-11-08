const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function buildManifest({ area, addr, size, cell, docCid, mime, bytes }) {
    return encoder.encode(JSON.stringify({
        v: 1,
        meta: { area, addr, size, cell },
        doc: { cid: docCid, alg: "AES-256-GCM", mime, bytes }
    }));
}

export function parseManifest(bytes) {
    try {
        const value = JSON.parse(decoder.decode(bytes));
        if (
            !value || value.v !== 1 ||
            !value.meta || typeof value.meta !== "object" ||
            typeof value.meta.area !== "string" ||
            typeof value.meta.addr !== "string" ||
            typeof value.meta.size !== "number" ||
            typeof value.meta.cell !== "string" ||
            !value.doc || typeof value.doc !== "object" ||
            typeof value.doc.cid !== "string" ||
            value.doc.alg !== "AES-256-GCM" ||
            typeof value.doc.mime !== "string" ||
            typeof value.doc.bytes !== "number"
        ) {
            throw new Error("invalid manifest");
        }
        return value;
    } catch {
        throw new Error("invalid manifest");
    }
}
