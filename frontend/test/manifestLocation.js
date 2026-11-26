import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest, parseManifest } from "../src/lib/manifest.js";


const base = { area: "Riverside", addr: "14 Market St", size: 450, cell: 0, docCid: "bafyDoc", mime: "application/pdf", bytes: 1234 };
const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

test("without a location the manifest bytes are identical to the previous format", () => {
    const legacy = new TextEncoder().encode(JSON.stringify({
        v: 1,
        meta: { area: base.area, addr: base.addr, size: base.size, cell: base.cell },
        doc: { cid: base.docCid, alg: "AES-256-GCM", mime: base.mime, bytes: base.bytes }
    }));
    assert.deepEqual(buildManifest(base), legacy);
    assert.deepEqual(buildManifest({ ...base, lat: undefined, lng: undefined }), legacy);
});

test("a valid location is stored in meta and survives a round trip", () => {
    const bytes = buildManifest({ ...base, lat: 39.0997345, lng: -94.5786219 });
    const parsed = parseManifest(bytes);
    assert.equal(parsed.meta.lat, 39.099735);
    assert.equal(parsed.meta.lng, -94.578622);
    assert.equal(parsed.meta.area, "Riverside");
    assert.equal(parsed.doc.cid, "bafyDoc");
});

test("an invalid location is dropped, never written", () => {
    for (const [lat, lng] of [[100, 5], [5, 200], [NaN, 1], [0, 0], ["x", "y"], [null, null]]) {
        const meta = decode(buildManifest({ ...base, lat, lng })).meta;
        assert.equal("lat" in meta, false);
        assert.equal("lng" in meta, false);
    }
});

test("a manifest with a location still parses, and one without still parses", () => {
    assert.doesNotThrow(() => parseManifest(buildManifest({ ...base, lat: 10.5, lng: 20.5 })));
    assert.doesNotThrow(() => parseManifest(buildManifest(base)));
});

test("a manifest carrying a garbage location is still readable (consumers sanitise it)", () => {
    const hostile = new TextEncoder().encode(JSON.stringify({
        v: 1,
        meta: { area: "x", addr: "y", size: 1, cell: 0, lat: "<script>", lng: { a: 1 } },
        doc: { cid: "c", alg: "AES-256-GCM", mime: "text/plain", bytes: 1 }
    }));
    assert.doesNotThrow(() => parseManifest(hostile));
});
