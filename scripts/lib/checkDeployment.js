// Read-only on-chain check of a deployment file. Works with a plain ethers provider or Hardhat's.
async function checkDeployment({ ethers, provider, deployment, expectedChainId = 11155111n }) {
  const lines = [];
  const add = (ok, text) => lines.push({ ok, text });
  const net = await provider.getNetwork();
  add(net.chainId === BigInt(expectedChainId), `Connected chain id ${net.chainId} (expected ${expectedChainId})`);
  add(BigInt(deployment.chainId) === net.chainId, `Deployment file chain id ${deployment.chainId} matches the connected chain`);

  const names = ["RoleManager", "LandRegistry", "TitleEscrow", "DocumentAccess"];
  const c = {};
  for (const n of names) {
    const entry = deployment.contracts && deployment.contracts[n];
    if (!entry || !ethers.isAddress(entry.address)) { add(false, `${n}: missing or invalid address in the deployment file`); continue; }
    const code = await provider.getCode(entry.address);
    const size = (code.length - 2) / 2;
    add(size > 0, `${n.padEnd(15)} ${entry.address}  ${size > 0 ? "contract code found (" + size + " bytes)" : "NO CODE at this address"}`);
    if (size > 0) c[n] = new ethers.Contract(entry.address, entry.abi, provider);
  }
  const addr = (n) => deployment.contracts[n].address;
  const safe = async (label, fn) => { try { const [ok, text] = await fn(); add(ok, label + (text ? ": " + text : "")); } catch (e) { add(false, label + ": call failed (" + (e.shortMessage || e.message) + ")"); } };

  if (c.RoleManager && c.LandRegistry) await safe("LandRegistry uses this RoleManager", async () => [(await c.LandRegistry.roleManager()) === addr("RoleManager")]);
  if (c.RoleManager && c.TitleEscrow) await safe("TitleEscrow uses this RoleManager", async () => [(await c.TitleEscrow.roleManager()) === addr("RoleManager")]);
  if (c.LandRegistry && c.TitleEscrow) await safe("TitleEscrow uses this LandRegistry", async () => [(await c.TitleEscrow.registry()) === addr("LandRegistry")]);
  if (c.LandRegistry && c.DocumentAccess) await safe("DocumentAccess uses this LandRegistry", async () => [(await c.DocumentAccess.registry()) === addr("LandRegistry")]);
  if (c.RoleManager && c.TitleEscrow) await safe("TitleEscrow holds the escrow role", async () => [await c.RoleManager.isEscrow(addr("TitleEscrow"))]);
  if (c.RoleManager && deployment.admin) await safe("Admin wallet holds the admin role", async () => [await c.RoleManager.hasRole(await c.RoleManager.DEFAULT_ADMIN_ROLE(), deployment.admin), deployment.admin]);
  if (c.RoleManager && deployment.admin) await safe("Admin is NOT also an official", async () => {
    const a = deployment.admin; const bad = (await c.RoleManager.isRegistrar(a)) || (await c.RoleManager.isSurveyor(a)) || (await c.RoleManager.isCourt(a));
    return [!bad];
  });
  if (c.RoleManager) {
    const map = { registrar: "isRegistrar", surveyor: "isSurveyor", court: "isCourt", issuer: "isIssuer" };
    for (const [role, fn] of Object.entries(map)) for (const w of (deployment.roles && deployment.roles[role]) || []) await safe(`${role} role granted to ${w}`, async () => [await c.RoleManager[fn](w)]);
  }
  if (c.LandRegistry) await safe("Parcels registered so far", async () => [true, String(await c.LandRegistry.parcelCount())]);
  return { ok: lines.every((l) => l.ok), lines };
}
module.exports = { checkDeployment };
