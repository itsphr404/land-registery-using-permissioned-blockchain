// Run: node scripts/check-sepolia.js     (read-only; needs SEPOLIA_RPC_URL in .env; no gas, no key used)
require("dotenv").config({ quiet: true });
const { ethers } = require("ethers");
const path = require("path");
const { checkDeployment } = require("./lib/checkDeployment");
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

(async () => {
  if (!process.env.SEPOLIA_RPC_URL) { console.error("SEPOLIA_RPC_URL is missing in .env"); process.exit(1); }
  let deployment;
  try { deployment = require(path.join(__dirname, "../deployments/sepolia.json")); } catch { console.error("deployments/sepolia.json not found. Run npm run deploy:sepolia first."); process.exit(1); }
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  await withTimeout(provider.getNetwork(), Number(process.env.RPC_TIMEOUT_MS || 15000), "Could not reach SEPOLIA_RPC_URL. Check that the URL in .env is correct and complete.");
  const r = await checkDeployment({ ethers, provider, deployment });
  for (const l of r.lines) console.log((l.ok ? "OK    " : "FAIL  ") + l.text);
  console.log(r.ok ? "\nAll checks passed." : "\nSome checks FAILED. See the lines marked FAIL.");
  process.exit(r.ok ? 0 : 1);
})().catch((e) => { console.error("Check failed to run:", e.shortMessage || e.message); process.exit(1); });
