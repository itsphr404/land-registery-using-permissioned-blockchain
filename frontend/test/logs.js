import test from "node:test";
import assert from "node:assert/strict";
import { queryFilterChunked } from "../src/lib/logs.js";

function fakeContract(limit) {
  const calls = [];
  return {
    calls,
    runner: { provider: { async getBlockNumber() { return 100; } } },
    async queryFilter(filter, from, to) {
      calls.push([from, to]);
      if (limit && to - from + 1 > limit) {
        throw new Error("query returned too many results");
      }
      return Array.from({ length: to - from + 1 }, (_, index) => ({ blockNumber: from + index }));
    }
  };
}

test("reads all limited ranges once, in order, without gaps", async () => {
  const contract = fakeContract(25);
  const events = await queryFilterChunked(contract, {}, 1, 100, { step: 40, minStep: 5 });
  assert.deepEqual(events.map(event => event.blockNumber), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.ok(contract.calls.some(([, to]) => to < 40));
});

test("halves a chunk after a range-limit error", async () => {
  const contract = fakeContract(10);
  await queryFilterChunked(contract, {}, 1, 20, { step: 20, minStep: 5 });
  assert.deepEqual(contract.calls.slice(0, 2), [[1, 20], [1, 10]]);
});

test("uses one call without a limit, supports explicit end, and handles empty ranges", async () => {
  const contract = fakeContract();
  await queryFilterChunked(contract, {}, 5, 10, { step: 20 });
  assert.deepEqual(contract.calls, [[5, 10]]);
  assert.deepEqual(await queryFilterChunked(contract, {}, 20, 10), []);
});

test("gives up at minStep with the original error and does not hide other errors", async () => {
  const limited = fakeContract(10);
  let rangeError;
  try {
    await queryFilterChunked(limited, {}, 1, 12, { step: 11, minStep: 11 });
  } catch (error) {
    rangeError = error;
  }
  assert.ok(rangeError);
  assert.match(rangeError.message, /too many/);
  const contract = fakeContract();
  contract.queryFilter = async () => { throw new Error("permission denied"); };
  await assert.rejects(queryFilterChunked(contract, {}, 1, 2), /permission denied/);
});
