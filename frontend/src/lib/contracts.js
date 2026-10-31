import { ethers } from "ethers";
import { config, deployment } from "../config";

/**
 * Returns the wallet's BrowserProvider if provided, otherwise a fallback JsonRpcProvider.
 * @param {ethers.BrowserProvider|null} walletProvider
 * @returns {ethers.Provider}
 */
export function getReadProvider(walletProvider) {
  if (walletProvider) {
    return walletProvider;
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

/**
 * Returns ethers.Contract instances for RoleManager, LandRegistry, and TitleEscrow.
 * @param {ethers.Provider|ethers.Signer} runner
 * @returns {{ roleManager: ethers.Contract, registry: ethers.Contract, escrow: ethers.Contract } | null}
 */
export function getContracts(runner) {
  if (!deployment || !deployment.contracts) {
    return null;
  }

  const { RoleManager, LandRegistry, TitleEscrow } = deployment.contracts;
  if (!RoleManager || !LandRegistry || !TitleEscrow) {
    return null;
  }

  const roleManager = new ethers.Contract(RoleManager.address, RoleManager.abi, runner);
  const registry = new ethers.Contract(LandRegistry.address, LandRegistry.abi, runner);
  const escrow = new ethers.Contract(TitleEscrow.address, TitleEscrow.abi, runner);

  return { roleManager, registry, escrow };
}
