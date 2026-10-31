import { ethers } from "ethers";
import { deployment } from "../config";

/**
 * Returns contract instances connected to a signer (for write operations).
 * @param {ethers.Signer} signer
 * @returns {{ registry: ethers.Contract, escrow: ethers.Contract, roleManager: ethers.Contract } | null}
 */
export function getWriteContracts(signer) {
  if (!deployment || !deployment.contracts) return null;
  const { RoleManager, LandRegistry, TitleEscrow } = deployment.contracts;
  if (!RoleManager || !LandRegistry || !TitleEscrow) return null;

  return {
    roleManager: new ethers.Contract(RoleManager.address, RoleManager.abi, signer),
    registry: new ethers.Contract(LandRegistry.address, LandRegistry.abi, signer),
    escrow: new ethers.Contract(TitleEscrow.address, TitleEscrow.abi, signer),
  };
}

/**
 * Submit a new parcel for registration.
 * Caller must be one of the owners.
 */
export async function submitParcel(signer, owners, shares, docHash, cid) {
  const { registry } = getWriteContracts(signer);
  const tx = await registry.submitParcel(owners, shares, docHash, cid);
  const receipt = await tx.wait();
  const event = receipt.logs.find(l => l.fragment?.name === "ParcelSubmitted");
  return event?.args?.parcelId || null;
}

/**
 * Verify survey for a parcel. Only callable by Surveyor role.
 */
export async function verifySurvey(signer, parcelId) {
  const { registry } = getWriteContracts(signer);
  const tx = await registry.verifySurvey(parcelId);
  return tx.wait();
}

/**
 * Approve registration for a parcel. Only callable by Registrar role.
 */
export async function approveRegistration(signer, parcelId) {
  const { registry } = getWriteContracts(signer);
  const tx = await registry.approveRegistration(parcelId);
  return tx.wait();
}

/**
 * Current owner consents to listing parcel for sale.
 */
export async function consentToSale(signer, parcelId) {
  const { registry } = getWriteContracts(signer);
  const tx = await registry.consentToSale(parcelId);
  return tx.wait();
}

/**
 * List a parcel for sale. Caller must be an owner (the lister).
 */
export async function listParcel(signer, parcelId, price) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.listParcel(parcelId, price);
  return tx.wait();
}

/**
 * Buyer deposits exact price to fund the deal.
 */
export async function deposit(signer, parcelId, price) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.deposit(parcelId, { value: price });
  return tx.wait();
}

/**
 * Seller (lister) approves the sale.
 */
export async function approveAsSeller(signer, parcelId) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.approveAsSeller(parcelId);
  return tx.wait();
}

/**
 * Registrar approves the sale as lawful. Completes sale if seller already approved.
 */
export async function approveAsRegistrar(signer, parcelId) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.approveAsRegistrar(parcelId);
  return tx.wait();
}

/**
 * Withdraw owed funds (pull payment).
 */
export async function withdraw(signer) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.withdraw();
  return tx.wait();
}

/**
 * Refund buyer after 7-day deadline expires.
 */
export async function refundAfterDeadline(signer, parcelId) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.refundAfterDeadline(parcelId);
  return tx.wait();
}

/**
 * Seller cancels listing before any deposit.
 */
export async function cancelListing(signer, parcelId) {
  const { escrow } = getWriteContracts(signer);
  const tx = await escrow.cancelListing(parcelId);
  return tx.wait();
}

/**
 * Get human-readable status label from status code.
 */
export function getStatusLabel(statusCode) {
  const labels = {
    0: "None",
    1: "Submitted",
    2: "Survey Verified",
    3: "Registered",
    4: "Under Sale"
  };
  return labels[statusCode] || "Unknown";
}

/**
 * Get human-readable deal status label.
 */
export function getDealStatusLabel(statusCode) {
  const labels = {
    0: "None",
    1: "Listed",
    2: "Funded",
    3: "Completed",
    4: "Refunded",
    5: "Cancelled"
  };
  return labels[statusCode] || "Unknown";
}

/**
 * Format address with label if available in deployment.
 */
export function formatAddress(address) {
  if (!deployment?.accounts) return address?.slice(0, 6) + "...";
  const acc = deployment.accounts.find(a => a.address?.toLowerCase() === address?.toLowerCase());
  return acc?.label || (address?.slice(0, 6) + "...");
}