// Admin-only role grant for a deployed RoleManager. Checks everything it can BEFORE sending a transaction.
const ROLES = { registrar: ["REGISTRAR_ROLE", "isRegistrar"], surveyor: ["SURVEYOR_ROLE", "isSurveyor"], court: ["COURT_ROLE", "isCourt"], issuer: ["ISSUER_ROLE", "isIssuer"] };
const EXCLUSIVE = ["registrar", "surveyor", "court"];

async function grantRole({ ethers, deployment, signer, role, wallet, log = () => {} }) {
  if (!ROLES[role]) throw new Error(`Unknown role "${role}". Use one of: ${Object.keys(ROLES).join(", ")}.`);
  if (!ethers.isAddress(wallet) || ethers.getAddress(wallet) === ethers.ZeroAddress) throw new Error(`"${wallet}" is not a valid wallet address.`);
  const target = ethers.getAddress(wallet);
  const rm = new ethers.Contract(deployment.contracts.RoleManager.address, deployment.contracts.RoleManager.abi, signer);

  const signerAddr = await signer.getAddress();
  if (!(await rm.hasRole(await rm.DEFAULT_ADMIN_ROLE(), signerAddr))) throw new Error(`${signerAddr} is not the admin, so it cannot grant roles.`);
  if (await rm[ROLES[role][1]](target)) { log(`${target} already holds ${role}. Nothing to do.`); return { alreadyHeld: true, wallet: target }; }
  if (EXCLUSIVE.includes(role)) {
    for (const other of EXCLUSIVE.filter((r) => r !== role)) {
      if (await rm[ROLES[other][1]](target)) throw new Error(`${target} already holds ${other}. One wallet cannot hold two of registrar, surveyor and court. Use a different wallet.`);
    }
  }
  if (target === ethers.getAddress(signerAddr) && EXCLUSIVE.includes(role)) throw new Error("Do not give the admin wallet an official role. Use a separate wallet.");

  const tx = await rm.grantRole(await rm[ROLES[role][0]](), target);
  log(`Sent transaction ${tx.hash}. Waiting for confirmation...`);
  await tx.wait();
  if (!(await rm[ROLES[role][1]](target))) throw new Error("The transaction confirmed but the role is not set. Check the transaction on Etherscan.");
  return { alreadyHeld: false, wallet: target, hash: tx.hash };
}
module.exports = { grantRole, ROLES };
