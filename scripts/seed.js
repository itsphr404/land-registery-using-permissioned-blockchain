// SPDX-License-Identifier: MIT
// Seed script - creates demo parcels and writes parcel-metadata.json

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { put } = require("./lib/devIpfsStore");

async function main() {
    const crypto = await import(pathToFileURL(path.join(__dirname, "..", "frontend", "src", "lib", "docCrypto.js")).href);
    const { buildManifest } = await import(pathToFileURL(path.join(__dirname, "..", "frontend", "src", "lib", "manifest.js")).href);
    // Check deployments file exists
    const deploymentsPath = path.join(__dirname, "..", "deployments", "localhost.json");
    if (!fs.existsSync(deploymentsPath)) {
        console.error("\n❌ deployments/localhost.json not found");
        console.error("Run: npm run deploy:local first\n");
        process.exit(1);
    }

    // Check chain ID
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337n) {
        console.error(`\n❌ Refusing to run: expected chainId 31337 (localhost), got ${network.chainId}`);
        process.exit(1);
    }

    // Read deployment data
    const deployment = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

    // Get signers (hardhat node provides 20 accounts by default)
    const signers = await ethers.getSigners();

    // Attach to contracts using stored ABIs
    const RoleManager = await ethers.getContractFactory("RoleManager");
    const roleManager = new ethers.Contract(
        deployment.contracts.RoleManager.address,
        deployment.contracts.RoleManager.abi,
        signers[0]
    );

    const LandRegistry = await ethers.getContractFactory("LandRegistry");
    const registry = new ethers.Contract(
        deployment.contracts.LandRegistry.address,
        deployment.contracts.LandRegistry.abi,
        signers[0]
    );

    const TitleEscrow = await ethers.getContractFactory("TitleEscrow");
    const escrow = new ethers.Contract(
        deployment.contracts.TitleEscrow.address,
        deployment.contracts.TitleEscrow.abi,
        signers[0]
    );
    const documentAccess = new ethers.Contract(
        deployment.contracts.DocumentAccess.address,
        deployment.contracts.DocumentAccess.abi,
        signers[0]
    );

    // Connect signers by account index
    const registrar = registry.connect(signers[1]);
    const surveyor = registry.connect(signers[2]);
    const alice = registry.connect(signers[4]);
    const bob = registry.connect(signers[5]);
    const carol = registry.connect(signers[6]);
    const dave = registry.connect(signers[7]);
    const vaultAccounts = [
        { name: "Registrar", signer: signers[1] },
        { name: "Surveyor", signer: signers[2] },
        { name: "Alice", signer: signers[4] },
        { name: "Bob", signer: signers[5] },
        { name: "Carol", signer: signers[6] },
        { name: "Dave", signer: signers[7] }
    ];
    const vaults = {};
    for (const account of vaultAccounts) {
        const vault = await crypto.createVault("demo");
        vaults[account.signer.address.toLowerCase()] = vault;
        await (await documentAccess.connect(account.signer).registerEncryptionKey(
            `0x${crypto.toHex(crypto.vaultPublicKeyBytes(vault))}`
        )).wait();
    }

    const escrowRegistrar = escrow.connect(signers[1]);
    const escrowAlice = escrow.connect(signers[4]);
    const escrowBob = escrow.connect(signers[5]);
    const escrowCarol = escrow.connect(signers[6]);
    const escrowDave = escrow.connect(signers[7]);

    async function createDocument({ area, addr, size, parcelLabel }) {
        const file = new TextEncoder().encode(`Demo deed for ${parcelLabel}: ${addr}`);
        const fileKey = await crypto.generateFileKey();
        const ciphertext = await crypto.encryptFile(file, fileKey);
        const docCid = await put(ciphertext);
        const manifestBytes = buildManifest({
            area,
            addr,
            size: Number.parseInt(size, 10),
            cell: areaCells[area] || 0,
            docCid,
            mime: "text/plain",
            bytes: file.length
        });
        const manifestCid = await put(manifestBytes);
        const readers = new Set();
        return { file, fileKey, manifestCid, readers };
    }

    async function grantReaders(parcelId, fileKey, ownerIndexes) {
        const readerIndexes = [...new Set([...ownerIndexes, 1, 2])];
        const readers = [];
        for (const index of readerIndexes) {
            const address = signers[index].address;
            const vault = vaults[address.toLowerCase()];
            const publicKey = await crypto.importPublicKey(crypto.vaultPublicKeyBytes(vault));
            readers.push({
                address,
                wrapped: await crypto.wrapFileKey(fileKey, publicKey)
            });
        }
        await (await documentAccess.connect(signers[ownerIndexes[0]]).grantAccessBatch(
            parcelId,
            readers.map(reader => reader.address),
            readers.map(reader => `0x${crypto.toHex(reader.wrapped)}`)
        )).wait();
    }

    // Helper to create parcel with encrypted document metadata.
    async function createParcel({ submitter, owners, shares, area, addr, size, verify, approve, consent, list, deposit, depositAmount, escrowSigner }) {
        const document = await createDocument({
            area,
            addr,
            size,
            parcelLabel: `parcel-${owners.join("-")}`
        });
        const docHash = await crypto.sha256Bytes32(document.file);

        const tx = await submitter.submitParcel(
            owners.map(o => signers[o].address),
            shares,
            docHash,
            document.manifestCid
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const parcelId = event.args.parcelId;

        if (verify) await (await surveyor.verifySurvey(parcelId)).wait();
        if (approve) await (await registrar.approveRegistration(parcelId)).wait();
        if (consent) await (await registry.connect(signers[owners[0]]).consentToSale(parcelId)).wait();
        if (list) await (await escrow.connect(signers[owners[0]]).listParcel(parcelId, depositAmount)).wait();
        if (deposit) await (await escrow.connect(signers[escrowSigner]).deposit(parcelId, { value: depositAmount })).wait();
        await grantReaders(parcelId, document.fileKey, owners);

        // Record metadata keyed by parcel ID. Cells are unique within each area.
        const areaCell = (areaCells[area] || 0);
        areaCells[area] = areaCell + 1;
        parcelMetadata[String(parcelId)] = {
            area,
            addr,
            size,
            cell: areaCell
        };

        return parcelId;
    }

    console.log("\n🌱 Seeding demo data...\n");

    const parcelIds = [];
    const parcelMetadata = {};
    const areaCells = {};

    // ===== PARCEL 1: Alice 100%, fully registered =====
    console.log("Creating Parcel 1: Alice 100%, fully registered...");
    {
        const parcelId = await createParcel({
            submitter: alice,
            owners: [4],
            shares: [100],
            area: "Northfield",
            addr: "123 Main Street, Northfield",
            size: "1000 m2",
            verify: true,
            approve: true,
            consent: false,
            list: false
        });
        parcelIds.push(parcelId);
        console.log(`  Parcel ${parcelId}: Submitted → SurveyVerified → Registered`);
    }

    // ===== PARCEL 2: Alice 60%, Bob 40%, fully registered =====
    console.log("Creating Parcel 2: Alice 60% / Bob 40%, fully registered...");
    {
        const parcelId = await createParcel({
            submitter: alice,
            owners: [4, 5],
            shares: [60, 40],
            area: "Northfield",
            addr: "456 Oak Avenue, Northfield",
            size: "2500 m2",
            verify: true,
            approve: true,
            consent: false,
            list: false
        });
        parcelIds.push(parcelId);
        console.log(`  Parcel ${parcelId}: Submitted → SurveyVerified → Registered`);
    }

    // ===== PARCEL 3: Carol 100%, submitted only =====
    console.log("Creating Parcel 3: Carol 100%, submitted only...");
    {
        const parcelId = await createParcel({
            submitter: carol,
            owners: [6],
            shares: [100],
            area: "Riverside",
            addr: "789 River Road, Riverside",
            size: "500 m2",
            verify: false,
            approve: false,
            consent: false,
            list: false
        });
        parcelIds.push(parcelId);
        console.log(`  Parcel ${parcelId}: Submitted only`);
    }

    // ===== PARCEL 4: Bob 100%, survey verified only =====
    console.log("Creating Parcel 4: Bob 100%, survey verified only...");
    {
        const parcelId = await createParcel({
            submitter: bob,
            owners: [5],
            shares: [100],
            area: "Downtown",
            addr: "321 Commerce Blvd, Downtown",
            size: "750 m2",
            verify: true,
            approve: false,
            consent: false,
            list: false
        });
        parcelIds.push(parcelId);
        console.log(`  Parcel ${parcelId}: Submitted → SurveyVerified`);
    }

    // ===== PARCEL 5: Carol 100%, fully registered, consented, listed, Dave deposited =====
    console.log("Creating Parcel 5: Carol 100%, fully registered, listed, Dave deposited...");
    {
        const parcelId = await createParcel({
            submitter: carol,
            owners: [6],
            shares: [100],
            area: "Riverside",
            addr: "555 Lake View Drive, Riverside",
            size: "1200 m2",
            verify: true,
            approve: true,
            consent: true,
            list: true,
            deposit: true,
            depositAmount: ethers.parseEther("1"),
            escrowSigner: 7 // Dave
        });
        parcelIds.push(parcelId);
        console.log(`  Parcel ${parcelId}: Submitted → SurveyVerified → Registered → Consented → Listed → Funded (waiting for approvals)`);
    }

    // Write bundled parcel metadata for the React frontend.
    const dataDir = path.join(__dirname, "..", "frontend", "src", "data");
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const metadataPath = path.join(dataDir, "parcel-metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(parcelMetadata, null, 2));
    console.log(`\n📄 Parcel metadata written to ${metadataPath}`);
    const demoDir = path.join(__dirname, "..", "frontend", "src", "demo");
    fs.mkdirSync(demoDir, { recursive: true });
    const vaultPath = path.join(demoDir, "demo-vaults.json");
    fs.writeFileSync(vaultPath, JSON.stringify(vaults, null, 2));
    console.log(`🔐 Demo vaults written to ${vaultPath}`);

    // Print status table
    console.log("\n" + "=".repeat(100));
    console.log("SEED SUMMARY");
    console.log("=".repeat(100));
    console.log("Parcel | Status                    | Owners (Shares)              | Escrow State");
    console.log("-------|---------------------------|------------------------------|--------------");

    const statusLabels = {
        0: "None",
        1: "Submitted",
        2: "SurveyVerified",
        3: "Registered",
        4: "UnderSale"
    };

    // Count parcels per status
    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const parcelId of parcelIds) {
        const status = await registry.getStatus(parcelId);
        const statusCode = Number(status);
        statusCounts[statusCode] = (statusCounts[statusCode] || 0) + 1;

        const [owners, shares] = await registry.getOwners(parcelId);
        const deal = await escrow.getDeal(parcelId);

        const ownersStr = owners.map((o, i) => {
            const label = deployment.accounts.find(a => a.address === o)?.label || o.slice(0, 6);
            return `${label} ${shares[i]}%`;
        }).join(", ");

        const escrowStatusCode = Number(deal.status);
        const escrowStatus = escrowStatusCode === 0 ? "—" :
            escrowStatusCode === 1 ? "Listed" :
            escrowStatusCode === 2 ? `Funded (buyer: ${deal.buyer.slice(0, 6)}...)` :
            "Completed/Refunded";

        console.log(`${String(parcelId).padStart(6)} | ${String(statusLabels[statusCode]).padEnd(25)} | ${ownersStr.padEnd(28)} | ${escrowStatus}`);
    }

    // Print counts per status
    console.log("=".repeat(100));
    console.log("PARCEL COUNTS PER STATUS:");
    console.log("-------------------------");
    console.log(`Submitted (1):        ${statusCounts[1] || 0}`);
    console.log(`Survey Verified (2):  ${statusCounts[2] || 0}`);
    console.log(`Registered (3):       ${statusCounts[3] || 0}`);
    console.log(`Under Sale (4):       ${statusCounts[4] || 0}`);
    console.log(`Total:                ${parcelIds.length}`);

    console.log("\n✅ Seeded " + parcelIds.length + " parcels\n");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});