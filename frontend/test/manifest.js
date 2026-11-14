import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest, parseManifest } from "../src/lib/manifest.js";

test("parseManifest accepts numeric map cells written by RegisterView", () => {
  const bytes = buildManifest({
    area: "Northfield",
    addr: "14 Market St",
    size: 450,
    cell: 3,
    docCid: "bafyexample",
    mime: "application/pdf",
    bytes: 12,
  });

  assert.equal(parseManifest(bytes).meta.cell, 3);
});

test("parseManifest continues to accept string map cells", () => {
  const bytes = buildManifest({
    area: "Northfield",
    addr: "14 Market St",
    size: 450,
    cell: "3",
    docCid: "bafyexample",
    mime: "application/pdf",
    bytes: 12,
  });

  assert.equal(parseManifest(bytes).meta.cell, "3");
});
