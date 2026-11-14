import { decodeRevert } from "./revert";

const MESSAGES = {
  NotRegistrar: "Only a registrar can perform this action.",
  NotSurveyor: "Only a surveyor can perform this action.",
  ConflictOfInterest: "This action would create a conflict of interest.",
  ConflictingRole: "That account already holds a conflicting role.",
  ConsentsMissing: "Every parcel owner must consent before the sale can be listed.",
  InvalidStatus: "The parcel is not in the required status for this action.",
  ParcelNotFound: "The network has not registered this parcel yet. Please wait a few seconds and retry.",
  NotParcelOwner: "Your wallet is not a parcel owner.",
  NotAParcelOwner: "Your wallet is not a parcel owner.",
  AlreadyConsented: "This owner has already consented for the current sale round.",
  DealExists: "This parcel already has an active sale.",
  NoActiveDeal: "This parcel has no active sale.",
  WrongDealStatus: "The sale is not in the required status for this action.",
  NotSeller: "Only the listed seller can perform this action.",
  WrongAmount: "The payment amount does not match the sale price.",
  BuyerIsOwner: "A parcel owner cannot buy their own parcel.",
  DealExpired: "This sale has expired.",
  AlreadyApproved: "This approval has already been recorded.",
  DeadlineNotReached: "The refund deadline has not been reached.",
  NothingToWithdraw: "There are no funds available to withdraw.",
  TransferFailed: "The payment transfer failed.",
  SharesMustSumTo100: "Owner shares must sum to 100%.",
  DuplicateOwner: "Each owner address must be unique.",
  ZeroShare: "Each owner must have a share greater than zero.",
  SubmitterNotAnOwner: "The submitting wallet must be one of the owners.",
  TooManyOwners: "A parcel cannot have more than 10 owners.",
  NoEncryptionKey: "This account has no registered encryption key.",
  NoAccess: "You do not have document access for this parcel.",
  EmptyKey: "An encryption key cannot be empty.",
  KeyTooLarge: "The encryption key is too large.",
  ArrayLengthMismatch: "The access lists must have matching lengths.",
  EmptyBatch: "Select at least one access recipient.",
  BatchTooLarge: "Too many access recipients were selected.",
  EmptyCid: "A document CID is required.",
};

export function friendlyError(error, contractInterfaces = []) {
  if (error?.code === "ACTION_REJECTED" || error?.code === 4001) {
    return "You cancelled the request.";
  }

  const interfaces = Array.isArray(contractInterfaces)
    ? Object.fromEntries(contractInterfaces.map((contractInterface, index) => [`Contract${index}`, contractInterface]))
    : contractInterfaces;
  const decoded = decodeRevert(error, interfaces);
  if (decoded?.name && MESSAGES[decoded.name]) {
    return MESSAGES[decoded.name];
  }
  if (decoded?.selector) {
    console.error("Unknown contract error:", error);
    return `Unknown contract error (selector ${decoded.selector})`;
  }

  const raw = error?.shortMessage || error?.reason || error?.message || "";
  if (/user rejected|rejected|4001/i.test(raw)) return "You cancelled the request.";
  if (/could not coalesce|network|rpc|connection/i.test(raw)) {
    return "The network request failed. Check that the local node is running.";
  }
  return raw || "The transaction failed.";
}
