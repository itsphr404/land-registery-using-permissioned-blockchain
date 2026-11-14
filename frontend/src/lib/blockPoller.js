import { withBackoff } from "./rpc";

const subscribers = new Map();
let timer = null;
let visibilityHandler = null;
let polling = false;

async function poll() {
  if (polling || (typeof document !== "undefined" && document.hidden) || subscribers.size === 0) return;
  polling = true;
  try {
    const provider = subscribers.keys().next().value;
    const block = await withBackoff(() => provider.getBlockNumber());
    const entry = subscribers.get(provider);
    if (entry && entry.lastBlock !== block) {
      entry.lastBlock = block;
      await Promise.all([...entry.callbacks].map((callback) => callback(block)));
    }
  } finally {
    polling = false;
  }
}

function ensureStarted() {
  if (timer || typeof document === "undefined") return;
  timer = setInterval(poll, 15000);
  visibilityHandler = () => {
    if (!document.hidden) poll();
  };
  document.addEventListener("visibilitychange", visibilityHandler);
}

function stopIfUnused() {
  if (subscribers.size > 0) return;
  clearInterval(timer);
  timer = null;
  if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
  visibilityHandler = null;
}

export function subscribeToBlockPoller(provider, callback) {
  let entry = subscribers.get(provider);
  if (!entry) {
    entry = { callbacks: new Set(), lastBlock: null };
    subscribers.set(provider, entry);
  }
  entry.callbacks.add(callback);
  ensureStarted();
  poll();

  return () => {
    const current = subscribers.get(provider);
    if (!current) return;
    current.callbacks.delete(callback);
    if (current.callbacks.size === 0) subscribers.delete(provider);
    stopIfUnused();
  };
}

export function pollNow() {
  return poll();
}
