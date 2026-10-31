const { ethers } = require("hardhat");

async function main() {
    // Read DAYS from process.env, default 1
    const days = parseInt(process.env.DAYS || "1", 10);

    if (isNaN(days) || days < 0) {
        console.error("❌ DAYS must be a non-negative integer");
        process.exit(1);
    }

    const seconds = days * 86400;

    // Check chain ID
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337n) {
        console.error(`❌ Refusing to run: expected chainId 31337 (localhost), got ${network.chainId}`);
        process.exit(1);
    }

    // Get current block
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = currentBlock.timestamp;

    console.log(`\n⏰ Current block timestamp: ${new Date(currentTimestamp * 1000).toISOString()}`);
    console.log(`⏰ Advancing time by ${days} day(s) (${seconds} seconds)...`);

    // Increase time
    await ethers.provider.send("evm_increaseTime", [seconds]);
    // Mine a new block
    await ethers.provider.send("evm_mine", []);

    // Get new block
    const newBlock = await ethers.provider.getBlock("latest");
    const newTimestamp = newBlock.timestamp;

    console.log(`\n✅ New block timestamp: ${new Date(newTimestamp * 1000).toISOString()}`);
    console.log(`✅ Time advanced by ${newTimestamp - currentTimestamp} seconds\n`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});