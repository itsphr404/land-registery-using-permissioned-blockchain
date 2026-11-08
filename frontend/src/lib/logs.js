const RANGE_ERROR = /range|limit|too many|exceed|more than|10 block|query returned|max results|response size/i;

export async function queryFilterChunked(
  contract,
  filter,
  fromBlock,
  toBlock = "latest",
  { step = 2000, minStep = 25 } = {}
) {
  const start = Number(fromBlock);
  const provider = contract.runner?.provider || contract.runner;
  const end = toBlock === "latest" ? await provider.getBlockNumber() : Number(toBlock);
  if (start > end) return [];
  let chunk = Math.max(Number(step), Number(minStep));
  const events = [];
  let cursor = start;

  while (cursor <= end) {
    const chunkEnd = Math.min(cursor + chunk - 1, end);
    try {
      events.push(...await contract.queryFilter(filter, cursor, chunkEnd));
      cursor = chunkEnd + 1;
    } catch (error) {
      if (!RANGE_ERROR.test(error?.message || "") || chunk <= minStep) throw error;
      chunk = Math.max(Number(minStep), Math.floor(chunk / 2));
    }
  }
  return events;
}
