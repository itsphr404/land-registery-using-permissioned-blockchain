import test, { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);

describe("rpc helpers (buildEventFilter, withBackoff)", () => {
  let H;
  before(async () => {
    H = await import(pathToFileURL(path.join(process.cwd(), "src/lib/rpc.js")).href);
  });
  const abi = () => require("../../artifacts/contracts/LandRegistry.sol/LandRegistry.json").abi;
  const contract = () => new ethers.Contract(ethers.ZeroAddress.replace(/0$/, "1"), abi(), ethers.getDefaultProvider("http://127.0.0.1:9"));

  describe("buildEventFilter", () => {
    it("returns a usable filter for real events", () => {
      const c = contract();
      for (const n of ["ParcelSubmitted", "ParcelRegistered", "SurveyVerified", "OwnershipTransferred"]) {
        const f = H.buildEventFilter(c, n);
        assert.notEqual(f, null, n);
        assert.equal(f.fragment.name, n);
      }
    });
    it("returns null for unknown names and bad input", () => {
      const c = contract();
      for (const bad of ["NotARealEvent", "", "parcelsubmitted", undefined, null, 5, {}, []]) {
        assert.equal(H.buildEventFilter(c, bad), null, String(bad));
      }
      assert.equal(H.buildEventFilter(null, "ParcelSubmitted"), null);
      assert.equal(H.buildEventFilter({}, "ParcelSubmitted"), null);
    });
  });

  describe("error classification", () => {
    it("recognises rate limiting", () => {
      assert.equal(H.isRateLimitError({ code: "SERVER_ERROR", info: { responseStatus: "429 Too Many Requests" } }), true);
      assert.equal(H.isRateLimitError(new Error("Too Many Requests")), true);
      assert.equal(H.isRateLimitError({ error: { message: "rate limit exceeded" } }), true);
      assert.equal(H.isRateLimitError(new Error("HTTP 429")), true);
    });
    it("recognises transient network failures", () => {
      for (const m of ["Failed to fetch", "NetworkError when attempting to fetch resource", "request timeout", "503 Service Unavailable", "ECONNRESET"]) {
        assert.equal(H.isTransientError(new Error(m)), true, m);
      }
    });
    it("does not treat logic errors as transient", () => {
      assert.equal(H.isTransientError(new TypeError("unknown event name (code=INVALID_ARGUMENT)")), false);
      assert.equal(H.isTransientError(new Error("execution reverted (unknown custom error)")), false);
      assert.equal(H.isTransientError(new Error("user rejected action")), false);
      assert.equal(H.isTransientError(null), false);
    });
  });

  describe("withBackoff", () => {
    const noSleep = (log) => async (ms) => { if (log) log.push(ms); };
    it("returns immediately on success", async () => {
      const log = [];
      assert.equal(await H.withBackoff(async () => 7, { sleep: noSleep(log) }), 7);
      assert.deepEqual(log, []);
    });
    it("retries transient errors with growing delays", async () => {
      let n = 0; const log = [];
      assert.equal(await H.withBackoff(async () => { if (++n < 3) throw new Error("Failed to fetch"); return "ok"; }, { baseMs: 100, sleep: noSleep(log) }), "ok");
      assert.equal(n, 3);
      assert.deepEqual(log, [100, 200]);
    });
    it("waits twice as long after a rate limit", async () => {
      let n = 0; const log = [];
      await H.withBackoff(async () => { if (++n < 3) throw new Error("429 Too Many Requests"); return 1; }, { baseMs: 100, sleep: noSleep(log) });
      assert.deepEqual(log, [200, 400]);
    });
    it("gives up after allowed retries", async () => {
      let n = 0;
      await assert.rejects(H.withBackoff(async () => { n++; throw new Error("429 Too Many Requests"); }, { retries: 3, sleep: noSleep() }), /429/);
      assert.equal(n, 4);
    });
    it("fails immediately on a logic error", async () => {
      let n = 0; const log = [];
      await assert.rejects(H.withBackoff(async () => { n++; throw new TypeError("unknown event name (code=INVALID_ARGUMENT)"); }, { sleep: noSleep(log) }));
      assert.equal(n, 1);
      assert.deepEqual(log, []);
    });
    it("caps delay and reports each retry", async () => {
      const log = [], seen = []; let n = 0;
      await H.withBackoff(async () => { if (++n < 5) throw new Error("timeout"); return 1; }, { retries: 5, baseMs: 5000, maxMs: 8000, sleep: noSleep(log), onRetry: (r) => seen.push(r.attempt) });
      assert.equal(Math.max(...log), 8000);
      assert.deepEqual(seen, [1, 2, 3, 4]);
    });
  });
});
