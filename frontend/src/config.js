export const config = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID || 31337),
  rpcUrl: import.meta.env.VITE_RPC_URL || (Number(import.meta.env.VITE_CHAIN_ID || 31337) === 31337 ? "http://127.0.0.1:8545" : ""),
  networkName: import.meta.env.VITE_NETWORK_NAME || (Number(import.meta.env.VITE_CHAIN_ID || 31337) === 31337 ? "Hardhat Local" : "Configured Network"),
  currencySymbol: import.meta.env.VITE_CURRENCY_SYMBOL || "ETH",
  storageMode: import.meta.env.VITE_STORAGE_MODE || "dev",
  devStoreUrl: import.meta.env.VITE_DEV_STORE_URL || "http://127.0.0.1:5055",
  kuboApi: import.meta.env.VITE_KUBO_API || "",
  signUrl: import.meta.env.VITE_SIGN_URL || "/api/upload-url",
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY || "",
  explorerUrl: (import.meta.env.VITE_EXPLORER_URL || "").replace(/\/+$/, ""),
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
config.deployBlock = matchedDeployment?.deployBlock || 0;
export const demoVaults = config.chainId === 31337
  ? Object.values(import.meta.glob("./demo/demo-vaults.json", { eager: true, import: "default" }))[0] || {}
  : {};

export const ADDRESS_LABELS = {};
if (deployment && Array.isArray(deployment.accounts)) {
  for (const acc of deployment.accounts) {
    if (acc.address && acc.label) {
      ADDRESS_LABELS[acc.address.toLowerCase()] = acc.label;
    }
  }
}
