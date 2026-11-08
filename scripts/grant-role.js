// Run: node scripts/grant-role.js <registrar|surveyor|court|issuer> <wallet address>
// Uses DEPLOYER_PRIVATE_KEY (the admin) and SEPOLIA_RPC_URL from .env. Never prints the key.
require("dotenv").config({ quiet: true });
const { ethers } = require("ethers");
const path = require("path");
const { grantRole } = require("./lib/grantRole");
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

(async () => {
  const [role, wallet] = process.argv.slice(2);
  if (!role || !wallet) { console.error("Usage: node scripts/grant-role.js <registrar|surveyor|court|issuer> <wallet address>"); process.exit(1); }
  if (!process.env.SEPOLIA_RPC_URL || !process.env.DEPLOYER_PRIVATE_KEY) { console.error("SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must be set in .env"); process.exit(1); }
  const deployment = require(path.join(__dirname, "../deployments/sepolia.json"));
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const net = await withTimeout(provider.getNetwork(), Number(process.env.RPC_TIMEOUT_MS || 15000), "Could not reach SEPOLIA_RPC_URL. Check that the URL in .env is correct and complete.");
  if (net.chainId !== BigInt(deployment.chainId)) throw new Error(`Connected to chain ${net.chainId} but the deployment is for chain ${deployment.chainId}.`);
  const r = await grantRole({ ethers, deployment, signer, role, wallet, log: console.log });
  console.log(r.alreadyHeld ? "No change." : `Done. ${r.wallet} is now ${role}. https://sepolia.etherscan.io/tx/${r.hash}`);
})().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); process.exit(1); });
