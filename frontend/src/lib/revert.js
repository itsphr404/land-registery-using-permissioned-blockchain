// Helpers for blockchain errors in the browser.
// 1) decodeRevert: names an error even when it was raised inside ANOTHER contract (e.g. LandRegistry's
//    ParcelNotFound while calling DocumentAccess), by trying every contract's interface.
// 2) waitUntil: poll until a condition holds (used to wait until the node has seen a just-mined parcel).

/** Finds the hex revert payload inside the nested error objects ethers and wallets produce. Ignores call data. */
export function extractRevertData(err, depth = 0) {
  if (err == null || depth > 6) return null;
  if (typeof err === "string") return /^0x[0-9a-fA-F]{8,}$/.test(err) ? err : null;
  if (typeof err !== "object") return null;
  for (const key of ["data", "error", "info", "cause"]) {
    const found = extractRevertData(err[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * interfaces: { LandRegistry: Interface, DocumentAccess: Interface, ... } (ethers v6 Interface objects)
 * Returns { contract, name, args } when some interface knows the error, { selector } when the payload is present
 * but unknown to all of them, or null when the error carries no revert payload at all.
 */
export function decodeRevert(err, interfaces) {
  const data = extractRevertData(err);
  if (!data) return null;
  for (const [contract, iface] of Object.entries(interfaces)) {
    let hit = null;
    try { hit = iface.parseError(data); } catch { hit = null; }
    if (hit) return { contract, name: hit.name, args: [...hit.args].map((a) => (typeof a === "bigint" ? a.toString() : a)) };
  }
  return { selector: data.slice(0, 10) };
}

/** Polls `check` until it returns a truthy value. Network errors count as "not yet". */
export async function waitUntil(check, { timeoutMs = 60000, intervalMs = 2000, what = "the network to catch up" } = {}) {
  const start = Date.now();
  let lastError = null;
  for (;;) {
    try { const ok = await check(); if (ok) return ok; lastError = null; } catch (e) { lastError = e; }
    if (Date.now() - start + intervalMs > timeoutMs) {
      throw new Error("Timed out waiting for " + what + (lastError ? " (last error: " + (lastError.shortMessage || lastError.message) + ")" : "") + ".");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
