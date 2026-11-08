const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TitleEscrow", function () {
    async function fixture() {
        const [admin, registrar, surveyor, alice, bob, carol, buyer, buyer2, attacker] = await ethers.getSigners();

        // Deploy RoleManager
        const RoleManager = await ethers.getContractFactory("RoleManager");
        const roleManager = await RoleManager.deploy(admin.address);
        await roleManager.waitForDeployment();

        // Grant roles
        await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
        await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), surveyor.address);

        // Deploy LandRegistry
        const LandRegistry = await ethers.getContractFactory("LandRegistry");
        const landRegistry = await LandRegistry.deploy(roleManager);
        await landRegistry.waitForDeployment();

        // Deploy TitleEscrow
        const TitleEscrow = await ethers.getContractFactory("TitleEscrow");
        const titleEscrow = await TitleEscrow.deploy(roleManager, landRegistry);
        await titleEscrow.waitForDeployment();

        // Grant ESCROW_ROLE to the escrow contract ADDRESS
        await roleManager.connect(admin).grantRole(await roleManager.ESCROW_ROLE(), await titleEscrow.getAddress());

        // Deploy ReentrancyAttacker mock
        const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
        const reentrancyAttacker = await ReentrancyAttacker.deploy();
        await reentrancyAttacker.waitForDeployment();

        // Map addresses to signers for helper functions
        const signers = {
            [admin.address]: admin,
            [registrar.address]: registrar,
            [surveyor.address]: surveyor,
            [alice.address]: alice,
            [bob.address]: bob,
            [carol.address]: carol,
            [buyer.address]: buyer,
            [buyer2.address]: buyer2,
            [attacker.address]: attacker
        };

        return {
            roleManager,
            landRegistry,
            titleEscrow,
            reentrancyAttacker,
            signers,
            admin,
            registrar,
            surveyor,
            alice,
            bob,
            carol,
            buyer,
            buyer2,
            attacker
        };
    }

    // Helper: submit -> verifySurvey -> approveRegistration
    async function registered(landRegistry, signers, registrar, surveyor, owners, shares) {
        const submitter = signers[owners[0]];
        const tx = await landRegistry.connect(submitter).submitParcel(owners, shares, ethers.id("deed"), "QmTest");
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
        const parcelId = event.args.parcelId;

        await landRegistry.connect(surveyor).verifySurvey(parcelId);
        await landRegistry.connect(registrar).approveRegistration(parcelId);
        return parcelId;
    }

    // Helper: all owners consent
    async function consentAll(landRegistry, signers, owners, parcelId) {
        for (const ownerAddr of owners) {
            await landRegistry.connect(signers[ownerAddr]).consentToSale(parcelId);
        }
    }

    // Helper: list parcel (after consent)
    async function listed(titleEscrow, seller, parcelId, price) {
        await titleEscrow.connect(seller).listParcel(parcelId, price);
    }

    // Helper: buyer deposits
    async function funded(titleEscrow, buyer, parcelId, price) {
        await titleEscrow.connect(buyer).deposit(parcelId, { value: price });
    }

    describe("DEPLOYMENT", function () {
        it("stores roleManager and registry addresses", async function () {
            const { titleEscrow, roleManager, landRegistry } = await loadFixture(fixture);
            expect(await titleEscrow.roleManager()).to.equal(await roleManager.getAddress());
            expect(await titleEscrow.registry()).to.equal(await landRegistry.getAddress());
        });

        it("reverts ZeroAddress when roleManager is zero", async function () {
            const { roleManager, landRegistry } = await loadFixture(fixture);
            const TitleEscrow = await ethers.getContractFactory("TitleEscrow");
            await expect(TitleEscrow.deploy(ethers.ZeroAddress, landRegistry))
                .to.be.revertedWithCustomError(TitleEscrow, "ZeroAddress");
        });

        it("reverts ZeroAddress when registry is zero", async function () {
            const { roleManager } = await loadFixture(fixture);
            const TitleEscrow = await ethers.getContractFactory("TitleEscrow");
            await expect(TitleEscrow.deploy(roleManager, ethers.ZeroAddress))
                .to.be.revertedWithCustomError(TitleEscrow, "ZeroAddress");
        });
    });

    describe("LIST", function () {
        it("owner lists after consent -> Listed event, deal stored, registry status 4", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);

            await expect(titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1")))
                .to.emit(titleEscrow, "Listed")
                .withArgs(parcelId, alice.address, ethers.parseEther("1"));

            const deal = await titleEscrow.getDeal(parcelId);
            expect(deal.seller).to.equal(alice.address);
            expect(deal.price).to.equal(ethers.parseEther("1"));
            expect(deal.status).to.equal(1); // Listed

            expect(await landRegistry.getStatus(parcelId)).to.equal(4); // UnderSale
        });

        it("reverts NotParcelOwner for non-owner", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, bob, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await expect(titleEscrow.connect(bob).listParcel(parcelId, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(titleEscrow, "NotParcelOwner");
        });

        it("reverts InvalidPrice when price is 0", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await expect(titleEscrow.connect(alice).listParcel(parcelId, 0))
                .to.be.revertedWithCustomError(titleEscrow, "InvalidPrice");
        });

        it("reverts ConsentsMissing from registry when consent is missing", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            // No consent given
            await expect(titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(landRegistry, "ConsentsMissing");
        });

        it("reverts InvalidStatus from registry for unregistered parcel", async function () {
            const { titleEscrow, landRegistry, surveyor, alice, signers } = await loadFixture(fixture);
            const { parcelId } = await submitParcelHelper(landRegistry, signers[alice.address], [alice.address], [100]);
            // Parcel is Submitted, not Registered
            await expect(titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(landRegistry, "InvalidStatus");
        });

        it("A1: listing the same parcel twice reverts (registry blocks second lockForSale)", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            // Second listing attempt - fails at TitleEscrow level (DealExists) before reaching registry
            await expect(titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(titleEscrow, "DealExists");
        });
    });

    describe("CANCEL", function () {
        it("seller cancels before deposit -> status back to 3, deal cleared, ListingCancelled event", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));

            await expect(titleEscrow.connect(alice).cancelListing(parcelId))
                .to.emit(titleEscrow, "ListingCancelled")
                .withArgs(parcelId);

            const deal = await titleEscrow.getDeal(parcelId);
            expect(deal.status).to.equal(0); // None (deleted = all zeros)
            expect(deal.seller).to.equal(ethers.ZeroAddress);
            expect(await landRegistry.getStatus(parcelId)).to.equal(3); // Registered
        });

        it("reverts NotSeller for non-seller", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, bob, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await expect(titleEscrow.connect(bob).cancelListing(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotSeller");
        });

        it("reverts WrongDealStatus after deposit", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            await expect(titleEscrow.connect(alice).cancelListing(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });

        it("reverts for unknown parcel", async function () {
            const { titleEscrow, alice } = await loadFixture(fixture);
            await expect(titleEscrow.connect(alice).cancelListing(999))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });
    });

    describe("DEPOSIT", function () {
        it("exact price accepted -> Deposited event, deadline = now + 7 days, escrow balance equals price", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));

            const before = await ethers.provider.getBlock("latest");
            const tx = await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            const expectedDeadline = block.timestamp + 7 * 24 * 60 * 60;

            await expect(tx)
                .to.emit(titleEscrow, "Deposited")
                .withArgs(parcelId, buyer.address, ethers.parseEther("1"), expectedDeadline);

            const deal = await titleEscrow.getDeal(parcelId);
            expect(deal.buyer).to.equal(buyer.address);
            expect(deal.status).to.equal(2); // Funded
            expect(deal.deadline).to.equal(expectedDeadline);

            expect(await ethers.provider.getBalance(await titleEscrow.getAddress())).to.equal(ethers.parseEther("1"));
        });

        it("reverts WrongAmount when price too low", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await expect(titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("0.5") }))
                .to.be.revertedWithCustomError(titleEscrow, "WrongAmount")
                .withArgs(ethers.parseEther("0.5"), ethers.parseEther("1"));
        });

        it("reverts WrongAmount when price too high", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await expect(titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("2") }))
                .to.be.revertedWithCustomError(titleEscrow, "WrongAmount")
                .withArgs(ethers.parseEther("2"), ethers.parseEther("1"));
        });

        it("A1: second buyer cannot deposit (WrongDealStatus)", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, buyer2, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            await expect(titleEscrow.connect(buyer2).deposit(parcelId, { value: ethers.parseEther("1") }))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });

        it("reverts BuyerIsOwner when an owner tries to deposit", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await expect(titleEscrow.connect(alice).deposit(parcelId, { value: ethers.parseEther("1") }))
                .to.be.revertedWithCustomError(titleEscrow, "BuyerIsOwner");
        });

        it("reverts NoActiveDeal for unlisted parcel", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            // Not listed
            await expect(titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") }))
                .to.be.revertedWithCustomError(titleEscrow, "NoActiveDeal");
        });
    });

    describe("SELLER APPROVAL", function () {
        it("only seller can approve (A3: attacker, buyer, registrar get NotSeller)", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, attacker, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await expect(titleEscrow.connect(attacker).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotSeller");
            await expect(titleEscrow.connect(buyer).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotSeller");
            await expect(titleEscrow.connect(registrar).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotSeller");

            // Seller succeeds
            await expect(titleEscrow.connect(alice).approveAsSeller(parcelId))
                .to.emit(titleEscrow, "Approved")
                .withArgs(parcelId, alice.address, true);
        });

        it("reverts WrongDealStatus if not Funded", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            // Not funded yet
            await expect(titleEscrow.connect(alice).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });

        it("reverts AlreadyApproved if seller already approved", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            await titleEscrow.connect(alice).approveAsSeller(parcelId);
            await expect(titleEscrow.connect(alice).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "AlreadyApproved");
        });

        it("reverts DealExpired after deadline", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await time.increase(7 * 24 * 60 * 60 + 1);
            await expect(titleEscrow.connect(alice).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "DealExpired");
        });
    });

    describe("REGISTRAR APPROVAL", function () {
        it("only registrar can approve (A3: surveyor, attacker, seller, buyer get NotRegistrar)", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, attacker, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await expect(titleEscrow.connect(surveyor).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotRegistrar");
            await expect(titleEscrow.connect(attacker).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotRegistrar");
            await expect(titleEscrow.connect(alice).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotRegistrar");
            await expect(titleEscrow.connect(buyer).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "NotRegistrar");

            // Registrar succeeds
            await expect(titleEscrow.connect(registrar).approveAsRegistrar(parcelId))
                .to.emit(titleEscrow, "Approved")
                .withArgs(parcelId, registrar.address, false);
        });

        it("reverts ConflictOfInterest when registrar is the buyer", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, roleManager, admin, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));

            // Grant registrar role to buyer
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), buyer.address);

            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            await expect(titleEscrow.connect(buyer).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "ConflictOfInterest");
        });

        it("reverts ConflictOfInterest when registrar is an owner", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, roleManager, admin, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            // Grant registrar role to alice (owner)
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), alice.address);

            await expect(titleEscrow.connect(alice).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "ConflictOfInterest");
        });

        it("reverts WrongDealStatus if not Funded", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            // Not funded
            await expect(titleEscrow.connect(registrar).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });

        it("reverts DealExpired after deadline", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await time.increase(7 * 24 * 60 * 60 + 1);
            await expect(titleEscrow.connect(registrar).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "DealExpired");
        });

        it("reverts AlreadyApproved if registrar already approved", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);
            await expect(titleEscrow.connect(registrar).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "AlreadyApproved");
        });
    });

    describe("A4: SINGLE APPROVAL DOES NOT COMPLETE", function () {
        it("seller approval alone does NOT complete the sale", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await titleEscrow.connect(alice).approveAsSeller(parcelId);

            // Parcel should still be UnderSale
            expect(await landRegistry.getStatus(parcelId)).to.equal(4); // UnderSale
            // Owner unchanged
            const [owners] = await landRegistry.getOwners(parcelId);
            expect(owners[0]).to.equal(alice.address);
            // Money still in escrow
            expect(await ethers.provider.getBalance(await titleEscrow.getAddress())).to.equal(ethers.parseEther("1"));
        });

        it("registrar approval alone does NOT complete the sale", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);

            expect(await landRegistry.getStatus(parcelId)).to.equal(4); // UnderSale
            const [owners] = await landRegistry.getOwners(parcelId);
            expect(owners[0]).to.equal(alice.address);
            expect(await ethers.provider.getBalance(await titleEscrow.getAddress())).to.equal(ethers.parseEther("1"));
        });
    });

    describe("COMPLETION", function () {
        it("both approvals (seller then registrar) -> buyer owns 100%, status 3, deal cleared, versionCount 2, version 0 intact", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await titleEscrow.connect(alice).approveAsSeller(parcelId);
            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);

            expect(await landRegistry.getStatus(parcelId)).to.equal(3); // Registered
            const [owners, shares] = await landRegistry.getOwners(parcelId);
            expect(owners.length).to.equal(1);
            expect(owners[0]).to.equal(buyer.address);
            expect(shares[0]).to.equal(100);

            const deal = await titleEscrow.getDeal(parcelId);
            expect(deal.status).to.equal(0); // None (cleared)
            expect(deal.seller).to.equal(ethers.ZeroAddress);

            expect(await landRegistry.versionCount(parcelId)).to.equal(2);
            const version0 = await landRegistry.getVersion(parcelId, 0);
            expect(version0.owners[0]).to.equal(alice.address); // Old owner preserved

            const pending = await titleEscrow.pendingWithdrawals(alice.address);
            expect(pending).to.equal(ethers.parseEther("1"));
        });

        it("both approvals (registrar then seller) works the same", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);
            await titleEscrow.connect(alice).approveAsSeller(parcelId);

            const [owners] = await landRegistry.getOwners(parcelId);
            expect(owners[0]).to.equal(buyer.address);
        });

        it("joint parcel 60/40 with 1 ether credits 0.6 and 0.4 ether", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, bob, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await consentAll(landRegistry, signers, [alice.address, bob.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await titleEscrow.connect(alice).approveAsSeller(parcelId);
            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);

            expect(await titleEscrow.pendingWithdrawals(alice.address)).to.equal(ethers.parseEther("0.6"));
            expect(await titleEscrow.pendingWithdrawals(bob.address)).to.equal(ethers.parseEther("0.4"));
        });

        it("rounding: price 101 wei with 60/40 credits 60, 40 and 1 wei remainder to seller", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, bob, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address, bob.address], [60, 40]);
            await consentAll(landRegistry, signers, [alice.address, bob.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, 101);
            await titleEscrow.connect(buyer).deposit(parcelId, { value: 101 });

            await titleEscrow.connect(alice).approveAsSeller(parcelId);
            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);

            expect(await titleEscrow.pendingWithdrawals(alice.address)).to.equal(61); // 60 + 1 remainder
            expect(await titleEscrow.pendingWithdrawals(bob.address)).to.equal(40);
            // Sum exactly equals price
            expect((await titleEscrow.pendingWithdrawals(alice.address)) + (await titleEscrow.pendingWithdrawals(bob.address))).to.equal(101);
        });
    });

    describe("REFUND", function () {
        it("reverts DeadlineNotReached before deadline", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await expect(titleEscrow.connect(buyer).refundAfterDeadline(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "DeadlineNotReached");
        });

        it("after deadline anyone can refund -> buyer credited, parcel unlocked (status 3), relist works with fresh consent", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, bob, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await time.increase(7 * 24 * 60 * 60 + 1);

            await expect(titleEscrow.connect(bob).refundAfterDeadline(parcelId))
                .to.emit(titleEscrow, "Refunded")
                .withArgs(parcelId, buyer.address, ethers.parseEther("1"));

            expect(await titleEscrow.pendingWithdrawals(buyer.address)).to.equal(ethers.parseEther("1"));
            expect(await landRegistry.getStatus(parcelId)).to.equal(3); // Registered

            const deal = await titleEscrow.getDeal(parcelId);
            expect(deal.status).to.equal(0); // None (cleared)
            expect(deal.buyer).to.equal(ethers.ZeroAddress);

            // Relist with fresh consent
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            expect(await landRegistry.getStatus(parcelId)).to.equal(4);
        });

        it("approvals after refund revert (deal cleared)", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await time.increase(7 * 24 * 60 * 60 + 1);
            await titleEscrow.connect(buyer).refundAfterDeadline(parcelId);

            await expect(titleEscrow.connect(alice).approveAsSeller(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
            await expect(titleEscrow.connect(registrar).approveAsRegistrar(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });

        it("refund on a Listed deal reverts WrongDealStatus", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            // No deposit yet
            await expect(titleEscrow.connect(alice).refundAfterDeadline(parcelId))
                .to.be.revertedWithCustomError(titleEscrow, "WrongDealStatus");
        });
    });

    describe("WITHDRAW", function () {
        it("seller collects exactly credited amount, Withdrawn event, second withdraw reverts", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });
            await titleEscrow.connect(alice).approveAsSeller(parcelId);
            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);

            const beforeBalance = await ethers.provider.getBalance(alice.address);
            const tx = await titleEscrow.connect(alice).withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const afterBalance = await ethers.provider.getBalance(alice.address);
            // Balance should increase by ~1 ether minus gas
            expect(afterBalance - beforeBalance + gasUsed).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));

            await expect(tx).to.emit(titleEscrow, "Withdrawn").withArgs(alice.address, ethers.parseEther("1"));

            // Second withdraw reverts
            await expect(titleEscrow.connect(alice).withdraw())
                .to.be.revertedWithCustomError(titleEscrow, "NothingToWithdraw");
        });

        it("buyer collects a refund after deadline", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, buyer, signers } = await loadFixture(fixture);
            const parcelId = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], parcelId);
            await titleEscrow.connect(alice).listParcel(parcelId, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(parcelId, { value: ethers.parseEther("1") });

            await time.increase(7 * 24 * 60 * 60 + 1);
            await titleEscrow.connect(buyer).refundAfterDeadline(parcelId);

            await expect(titleEscrow.connect(buyer).withdraw())
                .to.emit(titleEscrow, "Withdrawn")
                .withArgs(buyer.address, ethers.parseEther("1"));
        });
    });

    describe("A5 REENTRANCY", function () {
        async function prepareAttackerPayout() {
            const {
                reentrancyAttacker,
                landRegistry,
                titleEscrow,
                registrar,
                surveyor,
                buyer
            } = await loadFixture(fixture);
            const registryAddress = await landRegistry.getAddress();
            const escrowAddress = await titleEscrow.getAddress();
            const price = ethers.parseEther("1");

            await reentrancyAttacker.submitParcel(registryAddress, ethers.id("evil-deed"), "cid");
            const parcelId = await landRegistry.parcelCount();
            await landRegistry.connect(surveyor).verifySurvey(parcelId);
            await landRegistry.connect(registrar).approveRegistration(parcelId);
            await reentrancyAttacker.consent(registryAddress, parcelId);
            await reentrancyAttacker.list(escrowAddress, parcelId, price);
            await titleEscrow.connect(buyer).deposit(parcelId, { value: price });
            await reentrancyAttacker.approve(escrowAddress, parcelId);
            await titleEscrow.connect(registrar).approveAsRegistrar(parcelId);

            return { reentrancyAttacker, titleEscrow, price };
        }

        it("A5: attacker re-enters withdraw() during payout, the guard blocks it, funds are paid once", async function () {
            const { reentrancyAttacker, titleEscrow, price } = await prepareAttackerPayout();
            const attackerAddress = await reentrancyAttacker.getAddress();

            expect(await titleEscrow.pendingWithdrawals(attackerAddress)).to.equal(price);

            await reentrancyAttacker.attackWithdraw(await titleEscrow.getAddress());

            expect(await reentrancyAttacker.reentryAttempted()).to.equal(true);
            expect(await reentrancyAttacker.reentryBlocked()).to.equal(true);
            expect((await reentrancyAttacker.lastRevertData()).slice(0, 10))
                .to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
            expect(await ethers.provider.getBalance(attackerAddress)).to.equal(price);
            expect(await ethers.provider.getBalance(await titleEscrow.getAddress())).to.equal(0);
            expect(await titleEscrow.pendingWithdrawals(attackerAddress)).to.equal(0);
        });

        it("A5: a receiver that reverts makes withdraw() revert TransferFailed and keeps the balance", async function () {
            const { reentrancyAttacker, titleEscrow, price } = await prepareAttackerPayout();
            const attackerAddress = await reentrancyAttacker.getAddress();

            await reentrancyAttacker.setRevertOnReceive(true);

            await expect(reentrancyAttacker.attackWithdraw(await titleEscrow.getAddress()))
                .to.be.revertedWithCustomError(titleEscrow, "TransferFailed");
            expect(await titleEscrow.pendingWithdrawals(attackerAddress)).to.equal(price);
            expect(await ethers.provider.getBalance(await titleEscrow.getAddress())).to.equal(price);
        });
    });

    describe("DIRECT ETH", function () {
        it("sending ETH straight to escrow reverts", async function () {
            const { titleEscrow, buyer } = await loadFixture(fixture);
            await expect(buyer.sendTransaction({ to: await titleEscrow.getAddress(), value: ethers.parseEther("1") }))
                .to.be.reverted;
        });
    });

    describe("INVARIANT", function () {
        it("after mixed scenario: balance = sum of open deal prices + sum of pendingWithdrawals", async function () {
            const { titleEscrow, landRegistry, registrar, surveyor, alice, bob, carol, buyer, buyer2, signers } = await loadFixture(fixture);

            // Sale 1: Completed
            const p1 = await registered(landRegistry, signers, registrar, surveyor, [alice.address], [100]);
            await consentAll(landRegistry, signers, [alice.address], p1);
            await titleEscrow.connect(alice).listParcel(p1, ethers.parseEther("1"));
            await titleEscrow.connect(buyer).deposit(p1, { value: ethers.parseEther("1") });
            await titleEscrow.connect(alice).approveAsSeller(p1);
            await titleEscrow.connect(registrar).approveAsRegistrar(p1);
            // Alice withdraws
            await titleEscrow.connect(alice).withdraw();

            // Sale 2: Refunded
            const p2 = await registered(landRegistry, signers, registrar, surveyor, [bob.address], [100]);
            await consentAll(landRegistry, signers, [bob.address], p2);
            await titleEscrow.connect(bob).listParcel(p2, ethers.parseEther("2"));
            await titleEscrow.connect(buyer2).deposit(p2, { value: ethers.parseEther("2") });
            await time.increase(7 * 24 * 60 * 60 + 1);
            await titleEscrow.connect(buyer2).refundAfterDeadline(p2);
            // buyer2 hasn't withdrawn yet

            // Sale 3: Open funded deal
            const p3 = await registered(landRegistry, signers, registrar, surveyor, [carol.address], [100]);
            await consentAll(landRegistry, signers, [carol.address], p3);
            await titleEscrow.connect(carol).listParcel(p3, ethers.parseEther("3"));
            await titleEscrow.connect(buyer).deposit(p3, { value: ethers.parseEther("3") });
            // Still funded, not completed

            // Escrow balance = p2 price (2 eth, refunded but not withdrawn) + p3 price (3 eth, funded)
            const expectedBalance = ethers.parseEther("2") + ethers.parseEther("3");
            expect(await ethers.provider.getBalance(await titleEscrow.getAddress())).to.equal(expectedBalance);
        });
    });
});

// Helper for unregistered parcel test
async function submitParcelHelper(landRegistry, caller, owners, shares, docHash = ethers.id("deed"), cid = "QmTestCid") {
    const tx = await landRegistry.connect(caller).submitParcel(owners, shares, docHash, cid);
    const receipt = await tx.wait();
    const event = receipt.logs.find(l => l.fragment && l.fragment.name === "ParcelSubmitted");
    const parcelId = event ? event.args.parcelId : 1n;
    return { tx, parcelId, receipt };
}