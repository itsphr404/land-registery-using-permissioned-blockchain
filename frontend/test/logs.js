import test from "node:test";
import assert from "node:assert/strict";
import { queryFilterChunked } from "../src/lib/logs.js";

function fake({ latest, limit, err = "query exceeds max block range" }) {
  const calls = [];
  return {
    calls,
    runner: { provider: { getBlockNumber: async () => latest } },
    queryFilter: async (_filter, from, to) => {
      calls.push([from, to]);
      if (to - from + 1 > limit) throw new Error(err);
      return Array.from({ length: to - from + 1 }, (_, index) => ({ blockNumber: from + index }));
    },
  };
}

test("returns every event exactly once and in order, with no gaps, when the provider caps the range", async () => {
  const contract = fake({ latest: 2600, limit: 500 });
  const events = await queryFilterChunked(contract, "f", 100, "latest", { step: 2000 });
  assert.equal(events.length, 2501);
  assert.deepEqual(events.map(event => event.blockNumber), Array.from({ length: 2501 }, (_, i) => i + 100));
  assert.deepEqual(contract.calls[0], [100, 2099]);
  assert.ok(Math.max(...contract.calls.slice(-5).map(([from, to]) => to - from + 1)) <= 500);
});

test("halves the chunk size after a range error instead of failing", async () => {
  const contract = fake({ latest: 5000, limit: 600 });
  await queryFilterChunked(contract, "f", 0, "latest", { step: 2000 });
  const sizes = contract.calls.map(([from, to]) => to - from + 1);
  assert.equal(sizes[0], 2000);
  assert.ok(sizes.slice(1).some(size => size === 1000));
  assert.ok(Math.max(...sizes.slice(-5)) <= 600);
});

test("uses a single call when the provider has no limit", async () => {
  const contract = fake({ latest: 900, limit: 1e9 });
  const events = await queryFilterChunked(contract, "f", 0, "latest");
  assert.equal(contract.calls.length, 1);
  assert.equal(events.length, 901);
});

test("accepts an explicit end block", async () => {
  const contract = fake({ latest: 9999, limit: 1e9 });
  const events = await queryFilterChunked(contract, "f", 10, 19);
  assert.equal(events.length, 10);
});

test("returns nothing when from is after the end", async () => {
  const contract = fake({ latest: 5, limit: 1e9 });
  assert.deepEqual(await queryFilterChunked(contract, "f", 10), []);
  assert.equal(contract.calls.length, 0);
});

test("gives up with the original error when even the smallest chunk is rejected", async () => {
  const contract = fake({ latest: 1000, limit: 10 });
  await assert.rejects(
    queryFilterChunked(contract, "f", 0, "latest", { step: 200, minStep: 50 }),
    /max block range/
  );
});

test("does not hide errors that are not range problems", async () => {
  const contract = fake({ latest: 100, limit: 1, err: "connection refused" });
  await assert.rejects(queryFilterChunked(contract, "f", 0, "latest"), /connection refused/);
  assert.equal(contract.calls.length, 1);
});

test("works when the contract runner is a signer with a nested provider", async () => {
  const contract = fake({ latest: 50, limit: 1e9 });
  assert.equal((await queryFilterChunked(contract, "f", 0)).length, 51);
});

test("refuses an absurdly large range and sends no requests", async () => {
  const contract = fake({ latest: 10000000, limit: 1e9 });
  await assert.rejects(
    queryFilterChunked(contract, "f", 0, "latest"),
    /Refusing to scan 10000001 blocks \(limit 300000\).*deployment block/
  );
  assert.equal(contract.calls.length, 0);
});

test("allows a large range only when maxSpan is raised and accepts the wildcard event name", async () => {
  const contract = fake({ latest: 400000, limit: 1e9 });
  const events = await queryFilterChunked(contract, "*", 0, "latest", { step: 100000, maxSpan: 1e6 });
  assert.equal(events.length, 400001);
  assert.equal(contract.calls.length, 5);
});

test("allows a range exactly at the limit", async () => {
  const contract = fake({ latest: 299999, limit: 1e9 });
  assert.equal((await queryFilterChunked(contract, "f", 0, "latest")).length, 300000);
});
