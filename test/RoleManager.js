const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RoleManager", function () {
    async function fixture() {
        const [admin, registrar, surveyor, court, citizen, attacker] = await ethers.getSigners();
        const RoleManager = await ethers.getContractFactory("RoleManager");
        const roleManager = await RoleManager.deploy(admin.address);
        await roleManager.waitForDeployment();
        return { roleManager, admin, registrar, surveyor, court, citizen, attacker };
    }

    describe("constants", function () {
        it("REGISTRAR_ROLE equals ethers.id('REGISTRAR_ROLE')", async function () {
            const { roleManager } = await loadFixture(fixture);
            expect(await roleManager.REGISTRAR_ROLE()).to.equal(ethers.id("REGISTRAR_ROLE"));
        });

        it("SURVEYOR_ROLE equals ethers.id('SURVEYOR_ROLE')", async function () {
            const { roleManager } = await loadFixture(fixture);
            expect(await roleManager.SURVEYOR_ROLE()).to.equal(ethers.id("SURVEYOR_ROLE"));
        });

        it("COURT_ROLE equals ethers.id('COURT_ROLE')", async function () {
            const { roleManager } = await loadFixture(fixture);
            expect(await roleManager.COURT_ROLE()).to.equal(ethers.id("COURT_ROLE"));
        });

        it("ESCROW_ROLE equals ethers.id('ESCROW_ROLE')", async function () {
            const { roleManager } = await loadFixture(fixture);
            expect(await roleManager.ESCROW_ROLE()).to.equal(ethers.id("ESCROW_ROLE"));
        });

        it("ISSUER_ROLE equals ethers.id('ISSUER_ROLE')", async function () {
            const { roleManager } = await loadFixture(fixture);
            expect(await roleManager.ISSUER_ROLE()).to.equal(ethers.id("ISSUER_ROLE"));
        });
    });

    describe("deployment", function () {
        it("admin holds DEFAULT_ADMIN_ROLE", async function () {
            const { roleManager, admin } = await loadFixture(fixture);
            expect(await roleManager.hasRole(await roleManager.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
        });

        it("reverts with ZeroAddress when admin is the zero address", async function () {
            const RoleManager = await ethers.getContractFactory("RoleManager");
            await expect(RoleManager.deploy(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(RoleManager, "ZeroAddress");
        });
    });

    describe("granting roles", function () {
        it("admin can grant REGISTRAR_ROLE and RoleGranted event is emitted", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            const tx = await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(tx)
                .to.emit(roleManager, "RoleGranted")
                .withArgs(await roleManager.REGISTRAR_ROLE(), registrar.address, admin.address);
            expect(await roleManager.isRegistrar(registrar.address)).to.be.true;
        });

        it("admin can grant SURVEYOR_ROLE", async function () {
            const { roleManager, admin, surveyor } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), surveyor.address);
            expect(await roleManager.isSurveyor(surveyor.address)).to.be.true;
        });

        it("admin can grant COURT_ROLE", async function () {
            const { roleManager, admin, court } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.COURT_ROLE(), court.address);
            expect(await roleManager.isCourt(court.address)).to.be.true;
        });

        it("admin can grant ESCROW_ROLE", async function () {
            const { roleManager, admin, citizen } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.ESCROW_ROLE(), citizen.address);
            expect(await roleManager.isEscrow(citizen.address)).to.be.true;
        });

        it("admin can grant ISSUER_ROLE", async function () {
            const { roleManager, admin, citizen } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.ISSUER_ROLE(), citizen.address);
            expect(await roleManager.isIssuer(citizen.address)).to.be.true;
        });

        it("A3: a non-admin (attacker) cannot grant any role", async function () {
            const { roleManager, attacker, registrar } = await loadFixture(fixture);
            await expect(
                roleManager.connect(attacker).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address)
            ).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount")
                .withArgs(attacker.address, await roleManager.DEFAULT_ADMIN_ROLE());
        });

        it("A4: a registrar cannot grant roles to anyone", async function () {
            const { roleManager, admin, registrar, citizen } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(
                roleManager.connect(registrar).grantRole(await roleManager.SURVEYOR_ROLE(), citizen.address)
            ).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount")
                .withArgs(registrar.address, await roleManager.DEFAULT_ADMIN_ROLE());
        });

        it("granting the same role twice does not revert and does not emit a second event", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            const tx = await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(tx).not.to.emit(roleManager, "RoleGranted");
        });
    });

    describe("revoking roles", function () {
        it("admin can revoke a role and RoleRevoked event is emitted", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            const tx = await roleManager.connect(admin).revokeRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(tx)
                .to.emit(roleManager, "RoleRevoked")
                .withArgs(await roleManager.REGISTRAR_ROLE(), registrar.address, admin.address);
            expect(await roleManager.isRegistrar(registrar.address)).to.be.false;
        });

        it("a non-admin cannot revoke a role", async function () {
            const { roleManager, admin, registrar, attacker } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(
                roleManager.connect(attacker).revokeRole(await roleManager.REGISTRAR_ROLE(), registrar.address)
            ).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount")
                .withArgs(attacker.address, await roleManager.DEFAULT_ADMIN_ROLE());
        });
    });

    describe("renouncing roles", function () {
        it("an account can renounce its own role", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            const tx = await roleManager.connect(registrar).renounceRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(tx)
                .to.emit(roleManager, "RoleRevoked")
                .withArgs(await roleManager.REGISTRAR_ROLE(), registrar.address, registrar.address);
            expect(await roleManager.isRegistrar(registrar.address)).to.be.false;
        });
    });

    describe("separation of duties", function () {
        it("cannot grant SURVEYOR_ROLE to an account that already holds REGISTRAR_ROLE (ConflictingRole)", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(
                roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), registrar.address)
            ).to.be.revertedWithCustomError(roleManager, "ConflictingRole")
                .withArgs(registrar.address, await roleManager.REGISTRAR_ROLE(), await roleManager.SURVEYOR_ROLE());
        });

        it("cannot grant REGISTRAR_ROLE to a surveyor (ConflictingRole)", async function () {
            const { roleManager, admin, surveyor } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), surveyor.address);
            await expect(
                roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), surveyor.address)
            ).to.be.revertedWithCustomError(roleManager, "ConflictingRole")
                .withArgs(surveyor.address, await roleManager.SURVEYOR_ROLE(), await roleManager.REGISTRAR_ROLE());
        });

        it("cannot grant COURT_ROLE to a registrar (ConflictingRole)", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await expect(
                roleManager.connect(admin).grantRole(await roleManager.COURT_ROLE(), registrar.address)
            ).to.be.revertedWithCustomError(roleManager, "ConflictingRole")
                .withArgs(registrar.address, await roleManager.REGISTRAR_ROLE(), await roleManager.COURT_ROLE());
        });

        it("cannot grant REGISTRAR_ROLE to a court officer (ConflictingRole)", async function () {
            const { roleManager, admin, court } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.COURT_ROLE(), court.address);
            await expect(
                roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), court.address)
            ).to.be.revertedWithCustomError(roleManager, "ConflictingRole")
                .withArgs(court.address, await roleManager.COURT_ROLE(), await roleManager.REGISTRAR_ROLE());
        });

        it("after revoking REGISTRAR_ROLE the same account CAN be granted SURVEYOR_ROLE", async function () {
            const { roleManager, admin, registrar } = await loadFixture(fixture);
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await roleManager.connect(admin).revokeRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), registrar.address);
            expect(await roleManager.isSurveyor(registrar.address)).to.be.true;
        });
    });

    describe("view helpers", function () {
        it("isRegistrar returns true for holder and false for others", async function () {
            const { roleManager, admin, registrar, citizen } = await loadFixture(fixture);
            expect(await roleManager.isRegistrar(registrar.address)).to.be.false;
            expect(await roleManager.isRegistrar(citizen.address)).to.be.false;
            await roleManager.connect(admin).grantRole(await roleManager.REGISTRAR_ROLE(), registrar.address);
            expect(await roleManager.isRegistrar(registrar.address)).to.be.true;
            expect(await roleManager.isRegistrar(citizen.address)).to.be.false;
        });

        it("isSurveyor returns true for holder and false for others", async function () {
            const { roleManager, admin, surveyor, citizen } = await loadFixture(fixture);
            expect(await roleManager.isSurveyor(surveyor.address)).to.be.false;
            await roleManager.connect(admin).grantRole(await roleManager.SURVEYOR_ROLE(), surveyor.address);
            expect(await roleManager.isSurveyor(surveyor.address)).to.be.true;
            expect(await roleManager.isSurveyor(citizen.address)).to.be.false;
        });

        it("isCourt returns true for holder and false for others", async function () {
            const { roleManager, admin, court, citizen } = await loadFixture(fixture);
            expect(await roleManager.isCourt(court.address)).to.be.false;
            await roleManager.connect(admin).grantRole(await roleManager.COURT_ROLE(), court.address);
            expect(await roleManager.isCourt(court.address)).to.be.true;
            expect(await roleManager.isCourt(citizen.address)).to.be.false;
        });

        it("isEscrow returns true for holder and false for others", async function () {
            const { roleManager, admin, citizen, attacker } = await loadFixture(fixture);
            expect(await roleManager.isEscrow(citizen.address)).to.be.false;
            await roleManager.connect(admin).grantRole(await roleManager.ESCROW_ROLE(), citizen.address);
            expect(await roleManager.isEscrow(citizen.address)).to.be.true;
            expect(await roleManager.isEscrow(attacker.address)).to.be.false;
        });

        it("isIssuer returns true for holder and false for others", async function () {
            const { roleManager, admin, citizen, attacker } = await loadFixture(fixture);
            expect(await roleManager.isIssuer(citizen.address)).to.be.false;
            await roleManager.connect(admin).grantRole(await roleManager.ISSUER_ROLE(), citizen.address);
            expect(await roleManager.isIssuer(citizen.address)).to.be.true;
            expect(await roleManager.isIssuer(attacker.address)).to.be.false;
        });
    });
});