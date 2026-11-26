import { createStorage } from "./ipfs";
import { parseManifest } from "./manifest";
import normalizeLoc from "./geo.js";

const found = new Map();
const failedAt = new Map();
const RETRY_AFTER_MS = 60000;

export async function readManifestMeta(cid, settings, makeStorage = createStorage) {
  if (!cid) return null;
  if (found.has(cid)) return found.get(cid);
  if (Date.now() - (failedAt.get(cid) || 0) < RETRY_AFTER_MS) return null;
  try {
    const storage = makeStorage({
      mode: settings.storageMode,
      devUrl: settings.devStoreUrl,
      kuboApi: settings.kuboApi,
      signUrl: settings.signUrl,
      gateway: settings.pinataGateway
    });
    const { meta } = parseManifest(await storage.download(cid));
    const details = { area: meta.area, addr: meta.addr, size: `${meta.size} m²`, cell: Number(meta.cell) };
    const loc = normalizeLoc(meta.lat, meta.lng);
    if (loc) {
      details.lat = loc.lat;
      details.lng = loc.lng;
    }
    found.set(cid, details);
    return details;
  } catch (error) {
    failedAt.set(cid, Date.now());
    console.warn(`Could not read the parcel details stored with ${cid}:`, error?.message || error);
    return null;
  }
}
