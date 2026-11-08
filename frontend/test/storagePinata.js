import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../src/lib/ipfs.js";

const bytes = new Uint8Array([1, 2, 3]);
const ok = (body) => ({ ok: true, status: 200, async json() { return body; }, async arrayBuffer() { return body; } });

test("requires a Pinata gateway", () => {
  assert.throws(() => createStorage({ mode: "pinata" }), /gateway domain is required/);
});

test("requests a signed URL, sends passphrase, and uses generic manifest metadata", async () => {
  const calls = [];
  const storage = createStorage({
    mode: "pinata",
    gateway: "https://gateway.example/",
    signUrl: "/sign",
    passphrase: "code",
    uploader: async (file, url) => {
      assert.equal(file.name, "manifest.json");
      assert.equal(file.type, "application/json");
      assert.equal(url, "https://signed.example");
      return { cid: "manifest-cid" };
    }
  });
  global.fetch = async (...args) => {
    calls.push(args);
    return ok({ url: "https://signed.example" });
  };
  assert.equal(await storage.upload(bytes, { kind: "manifest" }), "manifest-cid");
  assert.deepEqual(JSON.parse(calls[0][1].body), { kind: "manifest", size: 3 });
  assert.equal(calls[0][1].headers["x-pilot-passphrase"], "code");
});

test("maps signing failures and downloads from the gateway", async () => {
  global.fetch = async (url) => {
    if (url === "/sign") return { ok: false, status: 429, async text() { return ""; }, async json() { return {}; } };
    return { ok: true, status: 200, async arrayBuffer() { return Uint8Array.from([9]).buffer; } };
  };
  const storage = createStorage({ mode: "pinata", gateway: "gateway.example", signUrl: "/sign" });
  await assert.rejects(storage.upload(bytes), /Too many uploads/);
  assert.deepEqual(await storage.download("cid"), new Uint8Array([9]));
});

test("default Pinata uploader posts a single signed multipart request", async () => {
  const calls = [];
  global.fetch = async (...args) => {
    calls.push(args);
    return calls.length === 1
      ? ok({ url: "https://uploads.example/signed" })
      : { ok: true, status: 200, async json() { return { data: { cid: "real-cid" } }; } };
  };
  const storage = createStorage({ mode: "pinata", gateway: "gateway.example" });
  assert.equal(await storage.upload(bytes), "real-cid");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], "https://uploads.example/signed");
  const form = calls[1][1].body;
  assert.equal(form.get("network"), "public");
  assert.equal(form.get("name"), "doc.bin");
  assert.equal(form.get("file").name, "doc.bin");
  assert.equal(calls[1][1].headers.Authorization, "Bearer undefined");
});
