const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { deployAll, ACCOUNT_LABELS } = require("./lib/deployAll");

async function main() {
    // Refuse to run unless chainId is 31337
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337n) {
        console.error(`\n❌ Refusing to run: expected chainId 31337 (localhost), got ${network.chainId}`);
        console.error("Run a local Hardhat node first: npx hardhat node\n");
        process.exit(1);
    }

    console.log("\n🚀 Deploying contracts...\n");

    const { roleManager, registry, escrow, documentAccess, signers } = await deployAll();

    const roleManagerAddr = await roleManager.getAddress();
    const registryAddr = await registry.getAddress();
    const escrowAddr = await escrow.getAddress();
    const documentAccessAddr = await documentAccess.getAddress();

    // Get deploy block number
    const deployBlock = await ethers.provider.getBlockNumber();

    // Create deployments folder if missing
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    // Read ABIs
    const roleManagerArtifact = await hre.artifacts.readArtifact("RoleManager");
    const registryArtifact = await hre.artifacts.readArtifact("LandRegistry");
    const escrowArtifact = await hre.artifacts.readArtifact("TitleEscrow");
    const documentAccessArtifact = await hre.artifacts.readArtifact("DocumentAccess");

    // Prepare deployment data
    const deploymentData = {
        chainId: Number(network.chainId),
        deployedAt: new Date().toISOString(),
        deployBlock: deployBlock,
        contracts: {
            RoleManager: {
                address: roleManagerAddr,
                abi: roleManagerArtifact.abi
            },
            LandRegistry: {
                address: registryAddr,
                abi: registryArtifact.abi
            },
            TitleEscrow: {
                address: escrowAddr,
                abi: escrowArtifact.abi
            },
            DocumentAccess: {
                address: documentAccessAddr,
                abi: documentAccessArtifact.abi
            }
        },
        accounts: []
    };

    // Add first 10 accounts with labels
    for (let i = 0; i < 10 && i < signers.length; i++) {
        const addr = await signers[i].getAddress();
        deploymentData.accounts.push({
            index: i,
            label: ACCOUNT_LABELS[i],
            address: addr
        });
    }

    // Write deployments/localhost.json
    const outputPath = path.join(deploymentsDir, "localhost.json");
    fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));

    // Also write to frontend/src/deployments/localhost.json for Vite's bundled config.
    const frontendDeploymentsDir = path.join(__dirname, "..", "frontend", "src", "deployments");
    if (!fs.existsSync(frontendDeploymentsDir)) {
        fs.mkdirSync(frontendDeploymentsDir, { recursive: true });
    }
    const frontendOutputPath = path.join(frontendDeploymentsDir, "localhost.json");
    fs.writeFileSync(frontendOutputPath, JSON.stringify(deploymentData, null, 2));

    // Print summary table
    console.log("\n" + "=".repeat(90));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(90));
    console.log(`Chain ID:          ${deploymentData.chainId}`);
    console.log(`Deployed At:       ${deploymentData.deployedAt}`);
    console.log(`Deploy Block:      ${deploymentData.deployBlock}`);
    console.log("-".repeat(90));
    console.log("Contracts:");
    console.log(`  RoleManager:     ${roleManagerAddr}`);
    console.log(`  LandRegistry:    ${registryAddr}`);
    console.log(`  TitleEscrow:     ${escrowAddr}`);
    console.log(`  DocumentAccess:  ${documentAccessAddr}`);
    console.log("-".repeat(90));
    console.log("Accounts & Roles:");
    console.log("  Index | Label      | Address                                    | Role");
    console.log("  ------|------------|--------------------------------------------|------------------");

    const roles = [
        "DEFAULT_ADMIN_ROLE",
        "REGISTRAR_ROLE",
        "SURVEYOR_ROLE",
        "COURT_ROLE",
        "—",
        "—",
        "—",
        "—",
        "ISSUER_ROLE",
        "—"
    ];

    for (let i = 0; i < deploymentData.accounts.length; i++) {
        const acc = deploymentData.accounts[i];
        console.log(`  ${String(i).padStart(4)} | ${acc.label.padEnd(10)} | ${acc.address} | ${roles[i]}`);
    }

    console.log("=".repeat(90));
    console.log(`\n✅ Deployment saved to: ${outputPath}\n`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});