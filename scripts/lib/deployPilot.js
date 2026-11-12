const fs = require("fs");
const path = require("path");

const GAS_LIMIT = 5_500_000n;
const FALLBACK_GAS_PRICE = 10_000_000_000n;
const MINIMUM_BALANCE = 50_000_000_000_000_000n;
const OFFICIAL_ROLES = ["registrars", "surveyors", "courts"];

function normalizeRoles(roles = {}) {
  const normalized = {};
  for (const role of ["registrars", "surveyors", "courts", "issuers"]) {
    const singular = role.slice(0, -1);
    if (roles[role] !== undefined && roles[singular] !== undefined) {
      throw new Error(`Specify either ${role} or ${singular} roles, not both.`);
    }
    const addresses = roles[role] === undefined ? roles[singular] : roles[role];
    if (addresses === undefined) {
      normalized[role] = [];
    } else if (Array.isArray(addresses)) {
      normalized[role] = addresses;
    } else {
      throw new Error(`${role} or ${singular} roles must be an array.`);
    }
  }
  return normalized;
}

function validateRoles(roles = {}, admin) {
  const normalized = normalizeRoles(roles);
  const all = new Map();
  for (const [role, addresses] of Object.entries(normalized)) {
    for (const address of addresses) {
      if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        throw new Error(`Invalid ${role} address: ${address}`);
      }
      if (/^0x0{40}$/i.test(address)) {
        throw new Error(`Zero address is not allowed for ${role}.`);
      }
      const key = address.toLowerCase();
      if (admin && key === admin.toLowerCase() && OFFICIAL_ROLES.includes(role)) {
        throw new Error("The admin cannot receive an official role.");
      }
      if (OFFICIAL_ROLES.includes(role)) {
        const previous = all.get(key);
        if (previous && previous !== role) {
          throw new Error(`Conflicting roles: ${address} is both ${previous} and ${role}.`);
        }
        all.set(key, role);
      }
    }
  }
  return normalized;
}

async function requiredBalance(provider, minBalanceWei) {
  if (minBalanceWei !== undefined) return BigInt(minBalanceWei);
  const feeData = await provider.getFeeData();
  const feePerGas = feeData.maxFeePerGas || FALLBACK_GAS_PRICE;
  const estimate = (GAS_LIMIT * BigInt(feePerGas) * 3n) / 2n;
  return estimate > MINIMUM_BALANCE ? estimate : MINIMUM_BALANCE;
}

async function deployPilot({
  ethers,
  artifacts,
  signer,
  expectedChainId = 11155111n,
  roles = {},
  minBalanceWei,
  outDirs,
  name = "sepolia",
  force = false,
  log = console.log,
}) {
  const provider = signer.provider;
  const network = await provider.getNetwork();
  const actualChainId = BigInt(network.chainId);
  const expected = BigInt(expectedChainId);
  if (actualChainId !== expected) {
    throw new Error(`Refusing to deploy: connected to chain ${actualChainId}, expected ${expected}.`);
  }

  const admin = await signer.getAddress();
  const normalizedRoles = validateRoles(roles, admin);
  const balance = await provider.getBalance(admin);
  const minimum = await requiredBalance(provider, minBalanceWei);
  if (balance < minimum) {
    const formatEther = ethers.formatEther || ethers.utils.formatEther;
    throw new Error(
      `Insufficient balance: current balance ${formatEther(balance)} ETH; ` +
      `requirement ${formatEther(minimum)} ETH; ` +
      `shortfall ${formatEther(minimum - balance)} ETH.`,
    );
  }

  const directories = (outDirs || []).map((directory) => path.resolve(directory));
  if (directories.length === 0) throw new Error("At least one deployment output directory is required.");
  const outputPaths = directories.map((directory) => path.join(directory, `${name}.json`));
  const existing = outputPaths.filter((outputPath) => fs.existsSync(outputPath));
  if (existing.length && !force) {
    throw new Error(`Deployment already exists: ${existing[0]}. Use force to replace it.`);
  }

  const deployBlock = await provider.getBlockNumber();
  const artifact = async (contractName) => artifacts.readArtifact(contractName);
  const deploy = async (contractName, args) => {
    const data = await artifact(contractName);
    const factory = new ethers.ContractFactory(data.abi, data.bytecode, signer);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    return { contract, artifact: data };
  };

  const roleManagerResult = await deploy("RoleManager", [admin]);
  const registryResult = await deploy("LandRegistry", [await roleManagerResult.contract.getAddress()]);
  const escrowResult = await deploy("TitleEscrow", [
    await roleManagerResult.contract.getAddress(),
    await registryResult.contract.getAddress(),
  ]);
  const documentAccessResult = await deploy("DocumentAccess", [
    await registryResult.contract.getAddress(),
  ]);

  const roleManager = roleManagerResult.contract;
  const grant = async (roleName, addresses) => {
    const role = await roleManager[`${roleName}_ROLE`]();
    for (const address of addresses) {
      const transaction = await roleManager.grantRole(role, address);
      await transaction.wait();
    }
  };
  const escrowAddress = await escrowResult.contract.getAddress();
  await grant("ESCROW", [escrowAddress]);
  await grant("REGISTRAR", normalizedRoles.registrars);
  await grant("SURVEYOR", normalizedRoles.surveyors);
  await grant("COURT", normalizedRoles.courts);
  await grant("ISSUER", normalizedRoles.issuers);

  const deployment = {
    chainId: Number(actualChainId),
    network: name,
    deployedAt: new Date().toISOString(),
    deployBlock,
    admin,
    roles: normalizedRoles,
    contracts: {
      RoleManager: { address: await roleManager.getAddress(), abi: roleManagerResult.artifact.abi },
      LandRegistry: { address: await registryResult.contract.getAddress(), abi: registryResult.artifact.abi },
      TitleEscrow: { address: escrowAddress, abi: escrowResult.artifact.abi },
      DocumentAccess: {
        address: await documentAccessResult.contract.getAddress(),
        abi: documentAccessResult.artifact.abi,
      },
    },
  };

  for (const [index, outputPath] of outputPaths.entries()) {
    const directory = directories[index];
    fs.mkdirSync(directory, { recursive: true });
    if (force && fs.existsSync(outputPath)) {
      let backupPath = `${outputPath.slice(0, -5)}.${Date.now()}.bak.json`;
      while (fs.existsSync(backupPath)) backupPath = `${outputPath.slice(0, -5)}.${Date.now() + 1}.bak.json`;
      fs.renameSync(outputPath, backupPath);
    }
    fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
    log(`Wrote ${outputPath}`);
  }
  return deployment;
}

module.exports = { deployPilot, validateRoles, requiredBalance };
