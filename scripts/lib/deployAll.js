const { ethers } = require("hardhat");

const ACCOUNT_LABELS = [
    "Admin",
    "Registrar",
    "Surveyor",
    "Court",
    "Alice",
    "Bob",
    "Carol",
    "Dave",
    "Issuer",
    "Eve"
];

async function deployAll() {
    const signers = await ethers.getSigners();

    // Deploy RoleManager
    const RoleManager = await ethers.getContractFactory("RoleManager");
    const roleManager = await RoleManager.deploy(signers[0].address);
    await roleManager.waitForDeployment();

    // Deploy LandRegistry
    const LandRegistry = await ethers.getContractFactory("LandRegistry");
    const registry = await LandRegistry.deploy(roleManager);
    await registry.waitForDeployment();

    // Deploy TitleEscrow
    const TitleEscrow = await ethers.getContractFactory("TitleEscrow");
    const escrow = await TitleEscrow.deploy(roleManager, registry);
    await escrow.waitForDeployment();

    // Grant roles
    const registrarRole = await roleManager.REGISTRAR_ROLE();
    const surveyorRole = await roleManager.SURVEYOR_ROLE();
    const courtRole = await roleManager.COURT_ROLE();
    const issuerRole = await roleManager.ISSUER_ROLE();
    const escrowRole = await roleManager.ESCROW_ROLE();

    const tx1 = await roleManager.connect(signers[0]).grantRole(registrarRole, signers[1].address);
    await tx1.wait();

    const tx2 = await roleManager.connect(signers[0]).grantRole(surveyorRole, signers[2].address);
    await tx2.wait();

    const tx3 = await roleManager.connect(signers[0]).grantRole(courtRole, signers[3].address);
    await tx3.wait();

    const tx4 = await roleManager.connect(signers[0]).grantRole(issuerRole, signers[8].address);
    await tx4.wait();

    const escrowAddress = await escrow.getAddress();
    const tx5 = await roleManager.connect(signers[0]).grantRole(escrowRole, escrowAddress);
    await tx5.wait();

    return { roleManager, registry, escrow, signers };
}

module.exports = { deployAll, ACCOUNT_LABELS };