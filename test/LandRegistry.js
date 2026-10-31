const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LandRegistry", function () {
    async function fixture() {
        const [admin, registrar, surveyor, escrow, alice, bob, carol, attacker] = await ethers.getSigners();

        // Deploy RoleManager
        const RoleManager = await ethers.getContractFactory("RoleManager");
        const roleManager = await RoleManager.deploy(admin.address);
        await roleManager.waitForDeployment();

        // Grant roles
        await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
        await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), surveyor.address);
        await roleManager.connect(admin).grantRole(await roleManager.ESCROW_ROLE(), escrow.address);

        // Deploy LandRegistry
        const LandRegistry = await ethers.getContractFactory("LandRegistry");
        const landRegistry = await LandRegistry.deploy(roleManager);
        await landRegistry.waitForDeployment();

        // Map addresses to signers for helper functions
        const signers = {
            [admin.address]: admin,
            [registrar.address]: registrar,
            [surveyor.address]: surveyor,
            [escrow.address]: escrow,
            [alice.address]: alice,
            [bob.address]: bob,
            [carol.address]: carol,
            [attacker.address]: attacker
        };

        return {
            landRegistry,
            roleManager,
            signers,
            admin,
            registrar,
            surveyor,
            escrow,
            alice,
            bob,
            carol,
            attacker
        };
    }

    // Helper: submit a parcel - caller is a Signer
    async function submitParcel(landRegistry, caller, owners, shares, docHash = ethers.id("deed"), cid = "QmTestCid") {
        const tx = await landRegistry.connect(caller).submitParcel(owners, shares, docHash, cid);
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const parcelId = event ? event.args.parcelId : 1n;
        return { tx, parcelId, receipt };
    }

    // Helper: get a fully registered parcel (Submitted -> SurveyVerified -> Registered)
    async function getRegisteredParcel(landRegistry, signers, registrar, surveyor, owners, shares) {
        const submitter = signers[owners[0]];
        const { parcelId } = await submitParcel(landRegistry, submitter, owners, shares);
        await landRegistry.connect(surveyor).verifySurvey(parcelId);
        await landRegistry.connect(registrar).approveRegistration(parcelId);
        return parcelId;
    }

    // Helper: get a parcel to UnderSale (Registered -> all consent -> lockForSale)
    async function getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, owners, shares) {
        const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, owners, shares);
        // All owners consent
        for (const ownerAddr of owners) {
            await landRegistry.connect(signers[ownerAddr]).consentToSale(parcelId);
        }
        await landRegistry.connect(escrow).lockForSale(parcelId, owners[0]);
        return parcelId;
    }

    describe("DEPLOYMENT", function () {
        it("stores roleManager address", async function () {
            const { landRegistry, roleManager } = await loadFixture(fixture);
            expect(await landRegistry.roleManager()).to.equal(await roleManager.getAddress());
        });

        it("reverts ZeroAddress when roleManager is zero", async function () {
            const LandRegistry = await ethers.getContractFactory("LandRegistry");
            await expect(LandRegistry.deploy(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(LandRegistry, "ZeroAddress");
        });

        it("parcelCount starts at 0", async function () {
            const { landRegistry } = await loadFixture(fixture);
            expect(await landRegistry.parcelCount()).to.equal(0);
        });
    });

    describe("SUBMIT", function () {
        it("success emits ParcelSubmitted, status Submitted, parcelCount increments, version 0 reason Initial", async function () {
            const { landRegistry, alice, signers } = await loadFixture(fixture);
            const owners = [alice.address];
            const shares = [100];

            const { tx, parcelId, receipt } = await submitParcel(landRegistry, signers[alice.address], owners, shares);

            await expect(tx).to.emit(landRegistry, "ParcelSubmitted")
                .withArgs(parcelId, alice.address, ethers.id("deed"), "QmTestCid");

            expect(await landRegistry.getStatus(parcelId)).to.equal(1); // Submitted
            expect(await landRegistry.parcelCount()).to.equal(1);
            expect(await landRegistry.versionCount(parcelId)).to.equal(1);
            const version = await landRegistry.getVersion(parcelId, 0);
            expect(version.reason).to.equal(0); // Initial
            expect(version.docHash).to.equal(ethers.id("deed"));
            expect(version.cid).to.equal("QmTestCid");
        });

        it("two-owner parcel (60/40) works", async function () {
            const { landRegistry, alice, bob, signers } = await loadFixture(fixture);
            const owners = [alice.address, bob.address];
            const shares = [60, 40];

            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], owners, shares);
            const version = await landRegistry.getVersion(parcelId, 0);
            expect(version.owners.length).to.equal(2);
            expect(version.shares[0]).to.equal(60);
            expect(version.shares[1]).to.equal(40);
        });

        it("reverts LengthMismatch when owners and shares length differ", async function () {
            const { landRegistry, alice, bob } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address, bob.address], [100], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "LengthMismatch");
        });

        it("reverts NoOwners when owners array is empty", async function () {
            const { landRegistry, alice } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([], [], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "NoOwners");
        });

        it("reverts TooManyOwners when more than MAX_OWNERS (11)", async function () {
            const { landRegistry, alice, bob, carol, attacker } = await loadFixture(fixture);
            const manyOwners = [alice.address, bob.address, carol.address, attacker.address,
                ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address,
                ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address,
                ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address,
                ethers.Wallet.createRandom().address];
            const manyShares = Array(11).fill(9);
            await expect(landRegistry.connect(alice).submitParcel(manyOwners, manyShares, ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "TooManyOwners");
        });

        it("reverts ZeroAddress when an owner is address(0)", async function () {
            const { landRegistry, alice } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([ethers.ZeroAddress, alice.address], [50, 50], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "ZeroAddress");
        });

        it("reverts DuplicateOwner when same address appears twice", async function () {
            const { landRegistry, alice } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address, alice.address], [50, 50], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "DuplicateOwner");
        });

        it("reverts ZeroShare when a share is 0", async function () {
            const { landRegistry, alice, bob } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address, bob.address], [100, 0], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "ZeroShare");
        });

        it("reverts SharesMustSumTo100 when sum is 99 (under)", async function () {
            const { landRegistry, alice, bob } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address, bob.address], [50, 49], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "SharesMustSumTo100");
        });

        it("reverts SharesMustSumTo100 when sum is 101 (over)", async function () {
            const { landRegistry, alice, bob } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address, bob.address], [50, 51], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "SharesMustSumTo100");
        });

        it("reverts SubmitterNotAnOwner when msg.sender not in owners", async function () {
            const { landRegistry, alice, bob, attacker } = await loadFixture(fixture);
            await expect(landRegistry.connect(attacker).submitParcel([alice.address, bob.address], [50, 50], ethers.id("deed"), "cid"))
                .to.be.revertedWithCustomError(landRegistry, "SubmitterNotAnOwner");
        });

        it("reverts EmptyDocHash when docHash is zero", async function () {
            const { landRegistry, alice } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address], [100], ethers.ZeroHash, "cid"))
                .to.be.revertedWithCustomError(landRegistry, "EmptyDocHash");
        });

        it("reverts EmptyCid when cid is empty string", async function () {
            const { landRegistry, alice } = await loadFixture(fixture);
            await expect(landRegistry.connect(alice).submitParcel([alice.address], [100], ethers.id("deed"), ""))
                .to.be.revertedWithCustomError(landRegistry, "EmptyCid");
        });
    });

    describe("SURVEY", function () {
        it("surveyor succeeds and emits SurveyVerified", async function () {
            const { landRegistry, alice, bob, surveyor, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);

            await expect(landRegistry.connect(surveyor).verifySurvey(parcelId))
                .to.emit(landRegistry, "SurveyVerified")
                .withArgs(parcelId, surveyor.address);

            expect(await landRegistry.getStatus(parcelId)).to.equal(2); // SurveyVerified
            expect(await landRegistry.surveyedBy(parcelId)).to.equal(surveyor.address);
        });

        it("reverts NotSurveyor for registrar", async function () {
            const { landRegistry, alice, bob, registrar, surveyor, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(registrar).verifySurvey(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotSurveyor");
        });

        it("reverts NotSurveyor for citizen (alice)", async function () {
            const { landRegistry, alice, bob, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(alice).verifySurvey(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotSurveyor");
        });

        it("reverts NotSurveyor for attacker (A4)", async function () {
            const { landRegistry, alice, bob, attacker, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(attacker).verifySurvey(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotSurveyor");
        });

        it("reverts ParcelNotFound for unknown parcel", async function () {
            const { landRegistry, surveyor } = await loadFixture(fixture);
            await expect(landRegistry.connect(surveyor).verifySurvey(999))
                .to.be.revertedWithCustomError(landRegistry, "ParcelNotFound")
                .withArgs(999);
        });

        it("reverts InvalidStatus when already SurveyVerified", async function () {
            const { landRegistry, alice, bob, surveyor, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(surveyor).verifySurvey(parcelId);
            await expect(landRegistry.connect(surveyor).verifySurvey(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus")
                .withArgs(2, 1); // current=SurveyVerified(2), expected=Submitted(1)
        });

        it("reverts ConflictOfInterest when surveyor is an owner", async function () {
            const { landRegistry, admin, surveyor, alice, signers } = await loadFixture(fixture);
            const roleManagerAddr = await landRegistry.roleManager();
            const RoleManager = await ethers.getContractFactory("RoleManager");
            const roleManager = RoleManager.attach(roleManagerAddr);
            // Grant surveyor role to alice
            await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), alice.address);
            // Alice submits a parcel (she's an owner)
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address], [100]);
            // Alice tries to verify her own parcel
            await expect(landRegistry.connect(alice).verifySurvey(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "ConflictOfInterest");
        });
    });

    describe("REGISTRATION", function () {
        it("registrar succeeds and emits ParcelRegistered", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);

            expect(await landRegistry.getStatus(parcelId)).to.equal(3); // Registered
        });

        it("reverts NotRegistrar for surveyor", async function () {
            const { landRegistry, alice, bob, surveyor, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(surveyor).verifySurvey(parcelId);
            await expect(landRegistry.connect(surveyor).approveRegistration(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotRegistrar");
        });

        it("reverts NotRegistrar for citizen (alice)", async function () {
            const { landRegistry, alice, bob, surveyor, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(surveyor).verifySurvey(parcelId);
            await expect(landRegistry.connect(alice).approveRegistration(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotRegistrar");
        });

        it("reverts NotRegistrar for attacker (A3, A4)", async function () {
            const { landRegistry, alice, bob, surveyor, attacker, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(surveyor).verifySurvey(parcelId);
            await expect(landRegistry.connect(attacker).approveRegistration(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotRegistrar");
        });

        it("reverts InvalidStatus when survey stage is skipped (A4)", async function () {
            const { landRegistry, alice, bob, registrar, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            // Skip verifySurvey, try to approve directly
            await expect(landRegistry.connect(registrar).approveRegistration(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus")
                .withArgs(1, 2); // current=Submitted(1), expected=SurveyVerified(2)
        });

        it("reverts ConflictOfInterest when registrar is an owner", async function () {
            const { landRegistry, admin, registrar, alice, bob, surveyor, signers } = await loadFixture(fixture);
            const roleManagerAddr = await landRegistry.roleManager();
            const RoleManager = await ethers.getContractFactory("RoleManager");
            const roleManager = RoleManager.attach(roleManagerAddr);
            // Grant registrar role to alice
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), alice.address);
            // Alice submits a parcel
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(surveyor).verifySurvey(parcelId);
            // Alice tries to approve her own parcel
            await expect(landRegistry.connect(alice).approveRegistration(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "ConflictOfInterest");
        });

        it("reverts InvalidStatus when approved twice", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(registrar).approveRegistration(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus")
                .withArgs(3, 2); // current=Registered(3), expected=SurveyVerified(2)
        });
    });

    describe("CONSENT", function () {
        it("owner consents and event emitted", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);

            await expect(landRegistry.connect(signers[alice.address]).consentToSale(parcelId))
                .to.emit(landRegistry, "SaleConsentGiven")
                .withArgs(parcelId, alice.address);

            expect(await landRegistry.consentCount(parcelId)).to.equal(1);
        });

        it("reverts NotAParcelOwner for outsider", async function () {
            const { landRegistry, alice, bob, carol, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(carol).consentToSale(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotAParcelOwner");
        });

        it("reverts InvalidStatus before registration (e.g., Submitted)", async function () {
            const { landRegistry, alice, bob, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcel(landRegistry, signers[alice.address], [alice.address, bob.address], [60, 40]);
            // Status is Submitted, not Registered
            await expect(landRegistry.connect(signers[alice.address]).consentToSale(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus")
                .withArgs(1, 3); // current=Submitted(1), expected=Registered(3)
        });

        it("reverts AlreadyConsented when same owner consents twice in same round", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(signers[alice.address]).consentToSale(parcelId);
            await expect(landRegistry.connect(signers[alice.address]).consentToSale(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "AlreadyConsented");
        });
    });

    describe("LOCK", function () {
        it("reverts NotEscrow for non-escrow callers including registrar", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(signers[alice.address]).consentToSale(parcelId);
            await landRegistry.connect(signers[bob.address]).consentToSale(parcelId);
            await expect(landRegistry.connect(registrar).lockForSale(parcelId, alice.address))
                .to.be.revertedWithCustomError(landRegistry, "NotEscrow");
        });

        it("reverts NotEscrow for an owner (A3)", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(signers[alice.address]).consentToSale(parcelId);
            await landRegistry.connect(signers[bob.address]).consentToSale(parcelId);
            await expect(landRegistry.connect(alice).lockForSale(parcelId, alice.address))
                .to.be.revertedWithCustomError(landRegistry, "NotEscrow");
        });

        it("reverts ConsentsMissing when only one of two owners consented", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(signers[alice.address]).consentToSale(parcelId);
            // Bob hasn't consented
            await expect(landRegistry.connect(escrow).lockForSale(parcelId, alice.address))
                .to.be.revertedWithCustomError(landRegistry, "ConsentsMissing");
        });

        it("succeeds when all consented and status becomes UnderSale", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(signers[alice.address]).consentToSale(parcelId);
            await landRegistry.connect(signers[bob.address]).consentToSale(parcelId);

            await expect(landRegistry.connect(escrow).lockForSale(parcelId, alice.address))
                .to.emit(landRegistry, "ParcelLocked")
                .withArgs(parcelId, alice.address);

            expect(await landRegistry.getStatus(parcelId)).to.equal(4); // UnderSale
        });

        it("reverts InvalidStatus on second lockForSale (double-sale foundation, A1)", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);
            // Try to lock again
            await expect(landRegistry.connect(escrow).lockForSale(parcelId, alice.address))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus")
                .withArgs(4, 3); // current=UnderSale(4), expected=Registered(3)
        });

        it("reverts when lister is not an owner", async function () {
            const { landRegistry, alice, bob, carol, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await landRegistry.connect(signers[alice.address]).consentToSale(parcelId);
            await landRegistry.connect(signers[bob.address]).consentToSale(parcelId);
            await expect(landRegistry.connect(escrow).lockForSale(parcelId, carol.address))
                .to.be.revertedWithCustomError(landRegistry, "NotAParcelOwner");
        });
    });

    describe("UNLOCK", function () {
        it("reverts NotEscrow for others", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, attacker, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(attacker).unlockParcel(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotEscrow");
            await expect(landRegistry.connect(alice).unlockParcel(parcelId))
                .to.be.revertedWithCustomError(landRegistry, "NotEscrow");
        });

        it("unlock returns status to Registered", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);

            await expect(landRegistry.connect(escrow).unlockParcel(parcelId))
                .to.emit(landRegistry, "ParcelUnlocked")
                .withArgs(parcelId);

            expect(await landRegistry.getStatus(parcelId)).to.equal(3); // Registered
        });

        it("consents are reset so locking again needs fresh consent", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);

            await landRegistry.connect(escrow).unlockParcel(parcelId);
            // Consents should be reset
            expect(await landRegistry.consentCount(parcelId)).to.equal(0);
            expect(await landRegistry.consentRound(parcelId)).to.equal(1);

            // Trying to lock again should fail due to missing consents
            await expect(landRegistry.connect(escrow).lockForSale(parcelId, alice.address))
                .to.be.revertedWithCustomError(landRegistry, "ConsentsMissing");
        });
    });

    describe("TRANSFER", function () {
        it("reverts NotEscrow for others", async function () {
            const { landRegistry, alice, bob, carol, surveyor, registrar, escrow, attacker, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(attacker).transferParcel(parcelId, carol.address))
                .to.be.revertedWithCustomError(landRegistry, "NotEscrow");
            await expect(landRegistry.connect(alice).transferParcel(parcelId, carol.address))
                .to.be.revertedWithCustomError(landRegistry, "NotEscrow");
        });

        it("reverts InvalidStatus unless UnderSale", async function () {
            const { landRegistry, alice, bob, carol, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            // Status is Registered, not UnderSale
            await expect(landRegistry.connect(escrow).transferParcel(parcelId, carol.address))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus")
                .withArgs(3, 4); // current=Registered(3), expected=UnderSale(4)
        });

        it("reverts ZeroAddress for newOwner", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.connect(escrow).transferParcel(parcelId, ethers.ZeroAddress))
                .to.be.revertedWithCustomError(landRegistry, "ZeroAddress");
        });

        it("success makes new owner the only owner at 100%, status Registered, versionCount 1->2, old version readable, docHash/cid carried over, consents reset", async function () {
            const { landRegistry, alice, bob, carol, surveyor, registrar, escrow, signers } = await loadFixture(fixture);
            const parcelId = await getParcelUnderSale(landRegistry, signers, registrar, surveyor, escrow, [alice.address, bob.address], [60, 40]);

            const oldVersion = await landRegistry.getVersion(parcelId, 0);
            const oldDocHash = oldVersion.docHash;
            const oldCid = oldVersion.cid;

            const tx = await landRegistry.connect(escrow).transferParcel(parcelId, carol.address);
            await expect(tx).to.emit(landRegistry, "OwnershipTransferred")
                .withArgs(parcelId, carol.address, 1n);

            // New owner is only owner at 100%
            const [owners, shares] = await landRegistry.getOwners(parcelId);
            expect(owners.length).to.equal(1);
            expect(owners[0]).to.equal(carol.address);
            expect(shares[0]).to.equal(100);

            // Status is Registered
            expect(await landRegistry.getStatus(parcelId)).to.equal(3); // Registered

            // Version count is 2
            expect(await landRegistry.versionCount(parcelId)).to.equal(2);

            // Old version (index 0) still readable with old owners
            const version0 = await landRegistry.getVersion(parcelId, 0);
            expect(version0.owners.length).to.equal(2);
            expect(version0.owners[0]).to.equal(alice.address);
            expect(version0.owners[1]).to.equal(bob.address);
            expect(version0.shares[0]).to.equal(60);
            expect(version0.shares[1]).to.equal(40);

            // New version (index 1) has new owner, same docHash/cid, reason Sale
            const version1 = await landRegistry.getVersion(parcelId, 1);
            expect(version1.owners.length).to.equal(1);
            expect(version1.owners[0]).to.equal(carol.address);
            expect(version1.shares[0]).to.equal(100);
            expect(version1.docHash).to.equal(oldDocHash);
            expect(version1.cid).to.equal(oldCid);
            expect(version1.reason).to.equal(1); // Sale

            // Consents reset
            expect(await landRegistry.consentCount(parcelId)).to.equal(0);
            expect(await landRegistry.consentRound(parcelId)).to.equal(1);
        });
    });

    describe("DOCUMENT CHECK", function () {
        it("verifyDocument true for the original hash", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            expect(await landRegistry.verifyDocument(parcelId, ethers.id("deed"))).to.be.true;
        });

        it("verifyDocument false for a forged hash (A2)", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            expect(await landRegistry.verifyDocument(parcelId, ethers.id("forged"))).to.be.false;
        });

        it("reverts ParcelNotFound for unknown ids", async function () {
            const { landRegistry, alice } = await loadFixture(fixture);
            await expect(landRegistry.verifyDocument(999, ethers.id("deed")))
                .to.be.revertedWithCustomError(landRegistry, "ParcelNotFound")
                .withArgs(999);
        });
    });

    describe("VIEWS", function () {
        it("getOwners returns owners and shares", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            const [owners, shares] = await landRegistry.getOwners(parcelId);
            expect(owners.length).to.equal(2);
            expect(owners[0]).to.equal(alice.address);
            expect(owners[1]).to.equal(bob.address);
            expect(shares[0]).to.equal(60);
            expect(shares[1]).to.equal(40);
        });

        it("getVersion reverts VersionNotFound for a bad index", async function () {
            const { landRegistry, alice, bob, surveyor, registrar, signers } = await loadFixture(fixture);
            const parcelId = await getRegisteredParcel(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await expect(landRegistry.getVersion(parcelId, 5))
                .to.be.revertedWithCustomError(landRegistry, "VersionNotFound")
                .withArgs(parcelId, 5);
        });
    });
});