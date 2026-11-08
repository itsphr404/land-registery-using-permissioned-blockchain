const { ethers, artifacts } = require("hardhat");
const path = require("path");
const { deployPilot } = require("./lib/deployPilot");

function addresses(value) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

async function main() {
  const [signer] = await ethers.getSigners();
  const deployment = await deployPilot({
    ethers,
    artifacts,
    signer,
    roles: {
      registrars: addresses(process.env.PILOT_REGISTRARS),
      surveyors: addresses(process.env.PILOT_SURVEYORS),
      courts: addresses(process.env.PILOT_COURTS),
      issuers: addresses(process.env.PILOT_ISSUERS),
    },
    outDirs: [
      path.join(__dirname, "..", "deployments"),
      path.join(__dirname, "..", "frontend", "src", "deployments"),
    ],
    force: process.env.FORCE === "1",
    name: "sepolia",
    log: (message) => console.log(message),
  });
  for (const contract of Object.values(deployment.contracts)) {
    console.log(`${contract.address} https://sepolia.etherscan.io/address/${contract.address}`);
  }
}

main().catch((error) => {
  console.error(`DEPLOY FAILED: ${error.message}`);
  process.exitCode = 1;
});
