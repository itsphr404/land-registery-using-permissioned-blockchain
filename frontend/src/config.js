export const config = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID || 31337),
  rpcUrl: import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545",
  networkName: import.meta.env.VITE_NETWORK_NAME || "Hardhat Local",
  currencySymbol: import.meta.env.VITE_CURRENCY_SYMBOL || "ETH",
};

const deploymentFiles = import.meta.glob("./deployments/*.json", {
  eager: true,
  import: "default",
});

let matchedDeployment = null;
for (const path in deploymentFiles) {
  const dep = deploymentFiles[path];
  if (dep && Number(dep.chainId) === config.chainId) {
    matchedDeployment = dep;
    break;
  }
}

export const deployment = matchedDeployment;

export const ADDRESS_LABELS = {};
if (deployment && Array.isArray(deployment.accounts)) {
  for (const acc of deployment.accounts) {
    if (acc.address && acc.label) {
      ADDRESS_LABELS[acc.address.toLowerCase()] = acc.label;
    }
  }
}
