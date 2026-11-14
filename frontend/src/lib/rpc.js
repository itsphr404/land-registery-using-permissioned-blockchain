// Helpers that keep the app from hammering a public RPC endpoint.
// buildEventFilter: never passes an empty/unknown filter to queryFilter (which throws "unknown event name").
// withBackoff:      retries ONLY transient problems (HTTP 429, network failures, timeouts) with growing delays;
//                   logic errors such as INVALID_ARGUMENT fail immediately instead of looping.

/** Returns a ready filter for an event that really exists in the contract's ABI, otherwise null. */
export function buildEventFilter(contract, name) {
  if (!contract || !contract.interface || typeof name !== "string" || !name) return null;
  let fragment = null;
  try { fragment = contract.interface.getEvent(name); } catch { fragment = null; }
  if (!fragment) return null;
  try { return contract.filters[fragment.name](); } catch { return null; }
}

const RATE_LIMIT = /\b429\b|too many requests|rate.?limit|exceeded .*(limit|quota)|capacity/i;
const TRANSIENT = /failed to fetch|network ?error|networkerror|timeout|timed out|etimedout|econnreset|econnrefused|server_error|502|503|504|bad gateway|service unavailable|load failed/i;
const textOf = (e) => [e && e.code, e && e.shortMessage, e && e.message, e && e.info && e.info.responseStatus, e && e.error && e.error.message, e && e.cause && e.cause.message].filter(Boolean).join(" | ");

export const isRateLimitError = (e) => RATE_LIMIT.test(textOf(e));
export const isTransientError = (e) => isRateLimitError(e) || TRANSIENT.test(textOf(e));

/**
 * fn: async () => value. Retries only while isTransientError(error) and attempts remain.
 * delays grow as baseMs * 2^attempt (rate limits wait twice as long). `sleep` is injectable for tests.
 */
export async function withBackoff(fn, { retries = 3, baseMs = 1000, maxMs = 15000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= retries || !isTransientError(e)) throw e;
      const wait = Math.min(maxMs, baseMs * 2 ** attempt * (isRateLimitError(e) ? 2 : 1));
      if (onRetry) onRetry({ attempt: attempt + 1, wait, error: e });
      await sleep(wait);
    }
  }
}
