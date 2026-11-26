import { normalizeLoc } from "./geo.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function buildManifest({ area, addr, size, cell, lat, lng, docCid, mime, bytes }) {
    const meta = { area, addr, size, cell };
    // Location is optional. Without a valid one the output is byte-for-byte what it was before.
    const loc = normalizeLoc(lat, lng);
    if (loc) {
        meta.lat = loc.lat;
        meta.lng = loc.lng;
    }
    return encoder.encode(JSON.stringify({
        v: 1,
        meta,
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
            (typeof value.meta.cell !== "string" && typeof value.meta.cell !== "number") ||
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
