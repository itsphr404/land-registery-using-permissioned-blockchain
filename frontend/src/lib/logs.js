// Reads contract events in block chunks. Public RPC endpoints often cap eth_getLogs ranges; when a chunk is
// rejected for being too large, the chunk size is halved and retried.
import { withBackoff } from "./rpc.js";

const RANGE_ERR = /range|limit|too many|exceed|more than|10 block|query returned|max results|response size/i;
const isRangeError = (e) => RANGE_ERR.test(String((e && (e.shortMessage || e.message)) || e));

// maxSpan guards against scanning from block 0 by mistake: millions of blocks means
// thousands of requests and a rate-limited RPC. Pass a larger maxSpan only when you really mean it.
export async function queryFilterChunked(contract, filter, fromBlock, toBlock = "latest", { step = 2000, minStep = 25, maxSpan = 300000 } = {}) {
  const provider = (contract.runner && contract.runner.provider) || contract.runner;
  const end = toBlock === "latest" ? await withBackoff(() => provider.getBlockNumber()) : toBlock;
  if (end - fromBlock + 1 > maxSpan) {
    throw new Error("Refusing to scan " + (end - fromBlock + 1) + " blocks (limit " + maxSpan + "). Check that fromBlock is the deployment block and not 0.");
  }
  const out = [];
  let from = fromBlock;
  let size = step;
  while (from <= end) {
    const to = Math.min(from + size - 1, end);
    try {
      out.push(...(await withBackoff(() => contract.queryFilter(filter, from, to))));
      from = to + 1;
    } catch (e) {
      if (!isRangeError(e) || size <= minStep) throw e;
      size = Math.max(minStep, Math.floor(size / 2));
    }
  }
  return out;
}
