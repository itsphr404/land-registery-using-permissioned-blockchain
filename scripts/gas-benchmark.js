const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { deployAll, ACCOUNT_LABELS } = require("./lib/deployAll");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function measureGas(txPromise, label) {
    const tx = await txPromise;
    const receipt = await tx.wait();
    const gasUsed = Number(receipt.gasUsed);
    return { label, gas: gasUsed };
}

async function runProposedBenchmarks() {
    console.log("\n📊 Running Proposed System Benchmarks...\n");

    // Fresh deployment
    const { roleManager, registry, escrow, documentAccess, signers } = await deployAll();
    const registrar = registry.connect(signers[1]);
    const surveyor = registry.connect(signers[2]);
    const alice = registry.connect(signers[4]);
    const bob = registry.connect(signers[5]);
    const carol = registry.connect(signers[6]);
    const dave = registry.connect(signers[7]);
    const escrowAlice = escrow.connect(signers[4]);
    const escrowBob = escrow.connect(signers[5]);
    const escrowCarol = escrow.connect(signers[6]);
    const escrowDave = escrow.connect(signers[7]);
    const escrowRegistrar = escrow.connect(signers[1]);

    const results = [];

    // Helper to create a parcel and get it to Registered state
    async function createAndRegisterParcel(owners, shares, docHash, cid) {
        const submitter = registry.connect(signers[owners[0]]);
        const tx = await submitter.submitParcel(
            owners.map(o => signers[o].address),
            shares,
            docHash,
            cid
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const parcelId = event.args.parcelId;

        await (await surveyor.verifySurvey(parcelId)).wait();
        await (await registrar.approveRegistration(parcelId)).wait();

        return parcelId;
    }

    // ===== submitParcel with 1 owner =====
    {
        const tx = await alice.submitParcel(
            [signers[4].address],
            [100],
            ethers.id("bench-1"),
            "cid-1"
        );
        const r = await measureGas(Promise.resolve(tx), "submitParcel(1 owner)");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== submitParcel with 2 owners =====
    {
        const tx = await alice.submitParcel(
            [signers[4].address, signers[5].address],
            [60, 40],
            ethers.id("bench-2"),
            "cid-2"
        );
        const r = await measureGas(Promise.resolve(tx), "submitParcel(2 owners)");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== submitParcel with 5 owners =====
    {
        const owners5 = [4, 5, 6, 7, 8].map(i => signers[i].address);
        const shares5 = [30, 25, 20, 15, 10];
        const tx = await alice.submitParcel(owners5, shares5, ethers.id("bench-5"), "cid-5");
        const r = await measureGas(Promise.resolve(tx), "submitParcel(5 owners)");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== submitParcel with 10 owners =====
    {
        const owners10 = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(i => signers[i].address);
        const shares10 = [20, 15, 15, 12, 10, 8, 7, 5, 5, 3];
        const tx = await alice.submitParcel(owners10, shares10, ethers.id("bench-10"), "cid-10");
        const r = await measureGas(Promise.resolve(tx), "submitParcel(10 owners)");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // Create a registered parcel for remaining tests
    const parcelId = await createAndRegisterParcel(
        [4], [100], ethers.id("bench-reg"), "cid-reg"
    );
    const documentKey = ethers.hexlify(ethers.randomBytes(294));
    const wrappedKey = ethers.hexlify(ethers.randomBytes(256));
    const documentAccessAlice = documentAccess.connect(signers[4]);
    const documentAccessBob = documentAccess.connect(signers[5]);
    const documentAccessCarol = documentAccess.connect(signers[6]);
    const documentAccessDave = documentAccess.connect(signers[7]);

    await (await documentAccessAlice.registerEncryptionKey(documentKey)).wait();
    {
        const r = await measureGas(
            documentAccessAlice.registerEncryptionKey(ethers.hexlify(ethers.randomBytes(294))),
            "registerEncryptionKey (294 bytes)"
        );
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    await (await documentAccessBob.registerEncryptionKey(documentKey)).wait();
    await (await documentAccessCarol.registerEncryptionKey(documentKey)).wait();
    await (await documentAccessDave.registerEncryptionKey(documentKey)).wait();
    {
        const r = await measureGas(
            documentAccessAlice.grantAccess(parcelId, signers[5].address, wrappedKey),
            "grantAccess (256 bytes)"
        );
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }
    {
        const r = await measureGas(
            documentAccessAlice.grantAccessBatch(
                parcelId,
                [signers[5].address, signers[6].address, signers[7].address],
                [wrappedKey, wrappedKey, wrappedKey]
            ),
            "grantAccessBatch (3 readers)"
        );
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }
    {
        const r = await measureGas(
            documentAccessAlice.revokeAccess(parcelId, signers[5].address),
            "revokeAccess"
        );
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }
    {
        const r = await measureGas(
            documentAccessAlice.rotateDocument(
                parcelId,
                "cid-rotated",
                [signers[5].address, signers[6].address],
                [wrappedKey, wrappedKey]
            ),
            "rotateDocument (2 readers)"
        );
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== verifySurvey =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-vs"), "cid-vs");
        // Need to reset to Submitted for verifySurvey
        // Actually we need a fresh Submitted parcel
        const tx = await alice.submitParcel(
            [signers[4].address],
            [100],
            ethers.id("bench-vs-submit"),
            "cid-vs"
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const pid = event.args.parcelId;

        const r = await measureGas(surveyor.verifySurvey(pid), "verifySurvey");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== approveRegistration =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-ar-submit"), "cid-ar");
        // Reset to SurveyVerified state
        const tx = await alice.submitParcel(
            [signers[4].address],
            [100],
            ethers.id("bench-ar-submit2"),
            "cid-ar2"
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const pid = event.args.parcelId;
        await (await surveyor.verifySurvey(pid)).wait();

        const r = await measureGas(registrar.approveRegistration(pid), "approveRegistration");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== consentToSale =====
    {
        const parcelId = await createAndRegisterParcel([4, 5], [60, 40], ethers.id("bench-cs"), "cid-cs");
        const r = await measureGas(registry.connect(signers[4]).consentToSale(parcelId), "consentToSale");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== listParcel =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-lp"), "cid-lp");
        await (await registry.connect(signers[4]).consentToSale(parcelId)).wait();
        const r = await measureGas(escrowAlice.listParcel(parcelId, ethers.parseEther("1")), "listParcel");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== deposit (1 ether) =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-dp"), "cid-dp");
        await (await registry.connect(signers[4]).consentToSale(parcelId)).wait();
        await (await escrowAlice.listParcel(parcelId, ethers.parseEther("1"))).wait();
        const r = await measureGas(escrowDave.deposit(parcelId, { value: ethers.parseEther("1") }), "deposit(1 ether)");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== approveAsSeller =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-as"), "cid-as");
        await (await registry.connect(signers[4]).consentToSale(parcelId)).wait();
        await (await escrowAlice.listParcel(parcelId, ethers.parseEther("1"))).wait();
        await (await escrowDave.deposit(parcelId, { value: ethers.parseEther("1") })).wait();
        const r = await measureGas(escrowAlice.approveAsSeller(parcelId), "approveAsSeller");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== approveAsRegistrar (completes sale) =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-arp"), "cid-arp");
        await (await registry.connect(signers[4]).consentToSale(parcelId)).wait();
        await (await escrowAlice.listParcel(parcelId, ethers.parseEther("1"))).wait();
        await (await escrowDave.deposit(parcelId, { value: ethers.parseEther("1") })).wait();
        await (await escrowAlice.approveAsSeller(parcelId)).wait();
        const r = await measureGas(escrowRegistrar.approveAsRegistrar(parcelId), "approveAsRegistrar (completes sale)");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== withdraw =====
    {
        const parcelId = await createAndRegisterParcel([4], [100], ethers.id("bench-wd"), "cid-wd");
        await (await registry.connect(signers[4]).consentToSale(parcelId)).wait();
        await (await escrowAlice.listParcel(parcelId, ethers.parseEther("1"))).wait();
        await (await escrowDave.deposit(parcelId, { value: ethers.parseEther("1") })).wait();
        await (await escrowAlice.approveAsSeller(parcelId)).wait();
        await (await escrowRegistrar.approveAsRegistrar(parcelId)).wait();
        const r = await measureGas(escrowAlice.withdraw(), "withdraw");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    // ===== refundAfterDeadline (separate scenario) =====
    {
        const { roleManager, registry: reg2, escrow: esc2, signers: s2 } = await deployAll();
        const surveyor2 = reg2.connect(s2[2]);
        const registrar2 = reg2.connect(s2[1]);
        const alice2 = reg2.connect(s2[4]);
        const carol2 = reg2.connect(s2[6]);
        const escrowAlice2 = esc2.connect(s2[4]);
        const escrowDave2 = esc2.connect(s2[7]);
        const escrowRegistrar2 = esc2.connect(s2[1]);

        const parcelId = await (async () => {
            const tx = await alice2.submitParcel([s2[4].address], [100], ethers.id("bench-ref"), "cid-ref");
            const receipt = await tx.wait();
            const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
            return event.args.parcelId;
        })();
        await (await surveyor2.verifySurvey(parcelId)).wait();
        await (await registrar2.approveRegistration(parcelId)).wait();
        await (await reg2.connect(s2[4]).consentToSale(parcelId)).wait();
        await (await escrowAlice2.listParcel(parcelId, ethers.parseEther("1"))).wait();
        await (await esc2.connect(s2[7]).deposit(parcelId, { value: ethers.parseEther("1") })).wait();

        // Advance time past 7-day deadline
        await time.increase(8 * 24 * 60 * 60);

        const r = await measureGas(esc2.connect(s2[9]).refundAfterDeadline(parcelId), "refundAfterDeadline");
        r.txs = 1;
        r.signers = 1;
        results.push(r);
    }

    return results;
}

async function runComparisonBenchmarks() {
    console.log("\n📊 Running Comparison Benchmarks (Proposed vs Baseline)...\n");

    const comparison = [];

    // --- REGISTRATION COMPARISON ---
    // Proposed: submitParcel(1 owner) + verifySurvey + approveRegistration
    {
        const { roleManager, registry, escrow, signers } = await deployAll();
        const surveyor = registry.connect(signers[2]);
        const registrar = registry.connect(signers[1]);
        const alice = registry.connect(signers[4]);

        const tx1 = await alice.submitParcel([signers[4].address], [100], ethers.id("cmp-reg-prop"), "cid");
        const r1 = await tx1.wait();
        const propSubmitGas = Number(r1.gasUsed);

        const event1 = r1.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const pid = event1.args.parcelId;

        const r2 = await (await surveyor.verifySurvey(pid)).wait();
        const propSurveyGas = Number(r2.gasUsed);

        const r3 = await (await registrar.approveRegistration(pid)).wait();
        const propApproveGas = Number(r3.gasUsed);

        const proposedRegGas = propSubmitGas + propSurveyGas + propApproveGas;

        // Baseline: registerParcel
        const { roleManager: rm2, registry: reg2 } = await (async () => {
            const RoleManager = await ethers.getContractFactory("RoleManager");
            const rm = await RoleManager.deploy(signers[0].address);
            await rm.waitForDeployment();
            const BaselineRegistry = await ethers.getContractFactory("BaselineRegistry");
            const br = await BaselineRegistry.deploy(signers[0].address);
            await br.waitForDeployment();
            return { roleManager: rm, registry: br };
        })();

        const baseTx = await reg2.connect(signers[0]).registerParcel(signers[4].address, ethers.id("cmp-reg-base"), "cid");
        const baseReceipt = await baseTx.wait();
        const baselineRegGas = Number(baseReceipt.gasUsed);

        comparison.push({
            operation: "Registration",
            proposedGas: proposedRegGas,
            proposedTxs: 3,
            proposedSigners: 3,
            baselineGas: baselineRegGas,
            baselineTxs: 1,
            baselineSigners: 1,
            ratio: (proposedRegGas / baselineRegGas).toFixed(2)
        });
    }

    // --- SALE COMPARISON ---
    // Proposed: consentToSale + listParcel + deposit + approveAsSeller + approveAsRegistrar (excl withdraw)
    {
        const { roleManager, registry, escrow, signers } = await deployAll();
        const surveyor = registry.connect(signers[2]);
        const registrar = registry.connect(signers[1]);
        const alice = registry.connect(signers[4]);
        const bob = registry.connect(signers[5]);
        const escrowAlice = escrow.connect(signers[4]);
        const escrowDave = escrow.connect(signers[7]);
        const escrowRegistrar = escrow.connect(signers[1]);

        // Setup: create registered parcel
        const tx = await alice.submitParcel([signers[4].address], [100], ethers.id("cmp-sale-prop"), "cid");
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const parcelId = event.args.parcelId;

        await (await surveyor.verifySurvey(parcelId)).wait();
        await (await registrar.approveRegistration(parcelId)).wait();

        // Sale steps
        const r1 = await (await registry.connect(signers[4]).consentToSale(parcelId)).wait();
        const consentGas = Number(r1.gasUsed);

        const r2 = await (await escrowAlice.listParcel(parcelId, ethers.parseEther("1"))).wait();
        const listGas = Number(r2.gasUsed);

        const r3 = await (await escrowDave.deposit(parcelId, { value: ethers.parseEther("1") })).wait();
        const depositGas = Number(r3.gasUsed);

        const r4 = await (await escrowAlice.approveAsSeller(parcelId)).wait();
        const sellerApproveGas = Number(r4.gasUsed);

        const r5 = await (await escrowRegistrar.approveAsRegistrar(parcelId)).wait();
        const registrarApproveGas = Number(r5.gasUsed);

        const proposedSaleGas = consentGas + listGas + depositGas + sellerApproveGas + registrarApproveGas;

        // Baseline: transferParcel
        const { roleManager: rm2, registry: reg2 } = await (async () => {
            const RoleManager = await ethers.getContractFactory("RoleManager");
            const rm = await RoleManager.deploy(signers[0].address);
            await rm.waitForDeployment();
            const BaselineRegistry = await ethers.getContractFactory("BaselineRegistry");
            const br = await BaselineRegistry.deploy(signers[0].address);
            await br.waitForDeployment();
            return { roleManager: rm, registry: br };
        })();

        // Need to register a parcel first in baseline
        await reg2.connect(signers[0]).registerParcel(signers[4].address, ethers.id("cmp-sale-base"), "cid");
        const baseTx = await reg2.connect(signers[0]).transferParcel(1, signers[7].address);
        const baseReceipt = await baseTx.wait();
        const baselineSaleGas = Number(baseReceipt.gasUsed);

        comparison.push({
            operation: "Sale (excl. withdraw)",
            proposedGas: proposedSaleGas,
            proposedTxs: 5,
            proposedSigners: new Set([
                signers[4].address,
                signers[7].address,
                signers[1].address
            ]).size,
            baselineGas: baselineSaleGas,
            baselineTxs: 1,
            baselineSigners: 1,
            ratio: (proposedSaleGas / baselineSaleGas).toFixed(2)
        });

        // Withdraw separately
        const r6 = await (await escrowAlice.withdraw()).wait();
        const withdrawGas = Number(r6.gasUsed);
        comparison.push({
            operation: "Withdraw (proposed only)",
            proposedGas: withdrawGas,
            proposedTxs: 1,
            proposedSigners: 1,
            baselineGas: "N/A",
            baselineTxs: "N/A",
            baselineSigners: "N/A",
            ratio: "N/A"
        });
    }

    return comparison;
}

function printTables(proposed, comparison) {
    console.log("\n" + "=".repeat(80));
    console.log("TABLE 1: Proposed System - Gas per Operation");
    console.log("=".repeat(80));

    const table1 = proposed.map(r => ({
        Operation: r.label,
        Gas: r.gas.toLocaleString(),
        Transactions: r.txs,
        Signers: r.signers
    }));
    console.table(table1);

    console.log("\n" + "=".repeat(80));
    console.log("TABLE 2: Proposed vs Baseline Comparison");
    console.log("=".repeat(80));

    const table2 = comparison.map(r => ({
        Operation: r.operation,
        "Proposed Gas": r.proposedGas.toLocaleString(),
        "Proposed TXs": r.proposedTxs,
        "Proposed Signers": r.proposedSigners,
        "Baseline Gas": typeof r.baselineGas === "number" ? r.baselineGas.toLocaleString() : r.baselineGas,
        "Baseline TXs": r.baselineTxs,
        "Baseline Signers": r.baselineSigners,
        "Ratio (P/B)": r.ratio
    }));
    console.table(table2);
}

function saveResults(proposed, comparison) {
    const metadata = {
        date: new Date().toISOString(),
        network: "hardhat in-process",
        solc: "0.8.24",
        optimizerRuns: 200,
        note: "gas is deterministic on this network; latency is not measured because blocks mine instantly",
        note2: "Baseline transfer moves no money; the proposed sale includes escrow custody, co-owner consent and dual approval, so the ratio is the price of protection, not a like-for-like cost."
    };

    const output = { metadata, proposed, comparison };

    // JSON
    const jsonPath = path.join(__dirname, "..", "results", "gas-results.json");
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));

    // CSV
    const csvPath = path.join(__dirname, "..", "results", "gas-results.csv");
    const headers = [
        "Operation", "Proposed Gas", "Proposed TXs", "Proposed Signers",
        "Baseline Gas", "Baseline TXs", "Baseline Signers", "Ratio (P/B)"
    ];
    const csvRows = [
        headers.join(","),
        ...proposed.map(r => `${r.label},${r.gas},${r.txs},${r.signers},,,,`),
        "",
        ...comparison.map(r =>
            `${r.operation},${r.proposedGas},${r.proposedTxs},${r.proposedSigners},` +
            `${r.baselineGas},${r.baselineTxs},${r.baselineSigners},${r.ratio}`
        )
    ];
    fs.writeFileSync(csvPath, csvRows.join("\n"));

    console.log(`\n✅ Results saved to:`);
    console.log(`   ${jsonPath}`);
    console.log(`   ${csvPath}`);
}

async function main() {
    try {
        const proposed = await runProposedBenchmarks();
        const comparison = await runComparisonBenchmarks();

        printTables(proposed, comparison);
        saveResults(proposed, comparison);

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

main();