import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/upload-url.js";

const secret = "top-secret-jwt";

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

function request(body, ip = Math.random().toString(36).slice(2)) {
  return { method: "POST", body, headers: { "x-forwarded-for": ip } };
}

function upstream(data = "https://signed.example/upload", ok = true) {
  return { ok, status: ok ? 200 : 401, async json() { return { data }; } };
}

test("signs ciphertext and returns only the URL", async () => {
  process.env.PINATA_JWT = secret;
  delete process.env.PILOT_PASSPHRASE;
  const calls = [];
  global.fetch = async (...args) => { calls.push(args); return upstream(); };
  const res = response();
  await handler(request(JSON.stringify({ kind: "ciphertext", size: 12 })), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { url: "https://signed.example/upload" });
  assert.equal(JSON.stringify(res.body).includes(secret), false);
  const init = calls[0][1];
  assert.equal(init.headers.Authorization, `Bearer ${secret}`);
  const body = JSON.parse(init.body);
  assert.equal(body.expires, 60);
  assert.equal(body.max_file_size, 12);
  assert.deepEqual(body.allow_mime_types, ["application/octet-stream"]);
});

test("signs manifests with JSON-only MIME types and parses string bodies", async () => {
  const calls = [];
  global.fetch = async (...args) => { calls.push(args); return upstream(); };
  const res = response();
  await handler(request(JSON.stringify({ kind: "manifest", size: 1 })), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(calls[0][1].body).allow_mime_types, ["application/json"]);
});

test("rejects methods, missing configuration, bad kind, and bad sizes", async () => {
  const methodRes = response();
  await handler({ method: "GET", headers: {} }, methodRes);
  assert.equal(methodRes.statusCode, 405);
  assert.equal(methodRes.headers.Allow, "POST");
  delete process.env.PINATA_JWT;
  const missingRes = response();
  await handler(request({ kind: "ciphertext", size: 1 }), missingRes);
  assert.equal(missingRes.statusCode, 500);
  process.env.PINATA_JWT = secret;
  let calls = 0;
  global.fetch = async () => { calls += 1; return upstream(); };
  for (const body of [{ kind: "bad", size: 1 }, { kind: "ciphertext", size: 0 }, { kind: "ciphertext", size: 12 * 1024 * 1024 + 1 }]) {
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls, 0);
});

test("checks passphrase and limits each IP independently", async () => {
  process.env.PILOT_PASSPHRASE = "access-code";
  global.fetch = async () => upstream();
  const unauthorized = response();
  await handler(request({ kind: "ciphertext", size: 1 }, "passphrase-ip"), unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  const authorized = response();
  await handler({ ...request({ kind: "ciphertext", size: 1 }, "passphrase-ip"), headers: { "x-forwarded-for": "passphrase-ip", "x-pilot-passphrase": "access-code" } }, authorized);
  assert.equal(authorized.statusCode, 200);
  for (let i = 0; i < 30; i += 1) {
    const res = response();
    await handler({ ...request({ kind: "ciphertext", size: 1 }, "limited-ip"), headers: { "x-forwarded-for": "limited-ip", "x-pilot-passphrase": "access-code" } }, res);
  }
  const limited = response();
  await handler({ ...request({ kind: "ciphertext", size: 1 }, "limited-ip"), headers: { "x-forwarded-for": "limited-ip", "x-pilot-passphrase": "access-code" } }, limited);
  assert.equal(limited.statusCode, 429);
  const other = response();
  await handler({ ...request({ kind: "ciphertext", size: 1 }, "other-ip"), headers: { "x-forwarded-for": "other-ip", "x-pilot-passphrase": "access-code" } }, other);
  assert.equal(other.statusCode, 200);
  delete process.env.PILOT_PASSPHRASE;
});

test("hides upstream failures and malformed responses", async () => {
  global.fetch = async () => upstream("secret-upstream-text", false);
  let res = response();
  await handler(request({ kind: "ciphertext", size: 1 }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.stringify(res.body).includes(secret), false);
  global.fetch = async () => { throw new Error(secret); };
  res = response();
  await handler(request({ kind: "ciphertext", size: 1 }), res);
  assert.equal(res.statusCode, 502);
  global.fetch = async () => ({ ok: true, async json() { return {}; } });
  res = response();
  await handler(request({ kind: "ciphertext", size: 1 }), res);
  assert.equal(res.statusCode, 502);
});
