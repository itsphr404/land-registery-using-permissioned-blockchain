import { createRequire } from "module";
import { describe, it, before } from "node:test";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const { expect } = require("chai");
const { ethers } = require("ethers");
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("revert helpers (decodeRevert, waitUntil)", function () {
  let R;
  const load = (n) => require(`../../artifacts/contracts/${n}.sol/${n}.json`).abi;
  const ifaces = () => ({ DocumentAccess: new ethers.Interface(load("DocumentAccess")), LandRegistry: new ethers.Interface(load("LandRegistry")), TitleEscrow: new ethers.Interface(load("TitleEscrow")), RoleManager: new ethers.Interface(load("RoleManager")) });
  before(async () => { R = await import(pathToFileURL(join(__dirname, "../src/lib/revert.js")).href); });

  const parcelNotFound = () => new ethers.Interface(load("LandRegistry")).encodeErrorResult("ParcelNotFound", [999]);
  const noKey = () => new ethers.Interface(load("DocumentAccess")).encodeErrorResult("NoEncryptionKey", ["0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"]);

  describe("extractRevertData", () => {
    it("finds the payload in err.data, err.error.data, err.info.error.data and deeper wallet nesting", () => {
      const d = parcelNotFound();
      expect(R.extractRevertData({ data: d })).to.equal(d);
      expect(R.extractRevertData({ error: { data: d } })).to.equal(d);
      expect(R.extractRevertData({ info: { error: { data: d } } })).to.equal(d);
      expect(R.extractRevertData({ error: { error: { data: { data: d } } } })).to.equal(d);
    });
    it("ignores the transaction's call data (it is not a revert payload)", () => {
      expect(R.extractRevertData({ transaction: { data: "0x1234567890abcdef" }, message: "x" })).to.equal(null);
    });
    it("returns null for errors without a payload, short strings, and non-objects", () => {
      for (const e of [null, undefined, 5, "text", {}, { data: "0x" }, { data: "0x12" }, new Error("network down")]) expect(R.extractRevertData(e)).to.equal(null);
    });
    it("does not loop forever on circular errors", () => {
      const a = {}; a.error = a; expect(R.extractRevertData(a)).to.equal(null);
    });
  });

  describe("decodeRevert", () => {
    it("names LandRegistry's ParcelNotFound even though DocumentAccess (the contract called) does not know it", () => {
      const only = new ethers.Interface(load("DocumentAccess"));
      expect(only.parseError(parcelNotFound())).to.equal(null);
      const r = R.decodeRevert({ info: { error: { data: parcelNotFound() } } }, ifaces());
      expect(r.contract).to.equal("LandRegistry");
      expect(r.name).to.equal("ParcelNotFound");
      expect(r.args).to.deep.equal(["999"]);
    });
    it("decodes DocumentAccess errors and stringifies bigint arguments", () => {
      const r = R.decodeRevert({ data: noKey() }, ifaces());
      expect(r.contract).to.equal("DocumentAccess");
      expect(r.name).to.equal("NoEncryptionKey");
      expect(r.args[0]).to.equal("0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc");
    });
    it("returns the selector when no contract knows the error, and null when there is no payload", () => {
      expect(R.decodeRevert({ data: "0xdeadbeef" }, ifaces())).to.deep.equal({ selector: "0xdeadbeef" });
      expect(R.decodeRevert(new Error("user rejected"), ifaces())).to.equal(null);
    });
  });

  describe("waitUntil", () => {
    it("returns as soon as the condition becomes true", async () => {
      let calls = 0;
      const v = await R.waitUntil(async () => ++calls >= 3 && "ready", { timeoutMs: 2000, intervalMs: 20 });
      expect(v).to.equal("ready"); expect(calls).to.equal(3);
    });
    it("treats network errors as 'not yet' and keeps polling", async () => {
      let calls = 0;
      const v = await R.waitUntil(async () => { calls++; if (calls < 3) throw new Error("rpc hiccup"); return true; }, { timeoutMs: 2000, intervalMs: 20 });
      expect(v).to.equal(true);
    });
    it("times out with a readable message that includes the last error", async () => {
      let msg = "";
      try { await R.waitUntil(async () => { throw new Error("node is behind"); }, { timeoutMs: 120, intervalMs: 30, what: "your parcel to appear" }); } catch (e) { msg = e.message; }
      expect(msg).to.match(/Timed out waiting for your parcel to appear/);
      expect(msg).to.match(/node is behind/);
    });
    it("times out when the condition never becomes true", async () => {
      let msg = ""; try { await R.waitUntil(async () => false, { timeoutMs: 100, intervalMs: 30 }); } catch (e) { msg = e.message; }
      expect(msg).to.match(/Timed out/);
    });
  });
});
