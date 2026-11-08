require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ quiet: true });

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

if (DEPLOYER_PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(DEPLOYER_PRIVATE_KEY)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hexadecimal private key.");
}

const config = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};

if (SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY) {
  config.networks = {
    ...(config.networks || {}),
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  };
}

if (ETHERSCAN_API_KEY) {
  config.etherscan = { apiKey: ETHERSCAN_API_KEY };
}

module.exports = config;