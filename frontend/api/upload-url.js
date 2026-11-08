import { timingSafeEqual } from "node:crypto";

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 30;
const requests = new Map();

function genericError(res, status) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error: status === 500 ? "Upload service is not configured." : "Could not create an upload URL." });
}

function passphraseMatches(provided, expected) {
  const actual = Buffer.from(provided || "");
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return genericError(res, 500);
  const expectedPassphrase = process.env.PILOT_PASSPHRASE;
  if (expectedPassphrase && !passphraseMatches(req.headers?.["x-pilot-passphrase"], expectedPassphrase)) {
    return res.status(401).json({ error: "The pilot access code is wrong or missing." });
  }

  const ip = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const prior = (requests.get(ip) || []).filter(timestamp => timestamp > now - WINDOW_MS);
  if (prior.length >= LIMIT) {
    requests.set(ip, prior);
    return res.status(429).json({ error: "Too many uploads. Please wait a few minutes." });
  }
  prior.push(now);
  requests.set(ip, prior);

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid request." });
  }
  const { kind, size } = body || {};
  if ((kind !== "ciphertext" && kind !== "manifest")
    || !Number.isInteger(size) || size < 1 || size > 12 * 1024 * 1024) {
    return res.status(400).json({ error: "Invalid upload request." });
  }

  try {
    const upstream = await fetch("https://uploads.pinata.cloud/v3/files/sign", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: Math.floor(now / 1000),
        expires: 60,
        max_file_size: size,
        allow_mime_types: kind === "manifest"
          ? ["application/json"]
          : ["application/octet-stream"]
      })
    });
    if (!upstream.ok) return genericError(res, 502);
    const result = await upstream.json();
    if (!result?.data || typeof result.data !== "string" || !result.data) return genericError(res, 502);
    return res.status(200).json({ url: result.data });
  } catch {
    return genericError(res, 502);
  }
}
