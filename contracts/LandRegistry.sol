// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRoleManager} from "./interfaces/IRoleManager.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LandRegistry
 * @notice Fraud-resilient land registry with compliance-gated fractional ownership.
 * Reads roles from an external IRoleManager; does not inherit AccessControl.
 */
contract LandRegistry is ReentrancyGuard {
    // Custom Errors
    error ZeroAddress();
    error LengthMismatch();
    error NoOwners();
    error TooManyOwners();
    error DuplicateOwner();
    error ZeroShare();
    error SharesMustSumTo100();
    error SubmitterNotAnOwner();
    error EmptyDocHash();
    error EmptyCid();
    error ParcelNotFound(uint256 parcelId);
    error InvalidStatus(uint8 current, uint8 expected);
    error NotSurveyor();
    error ConflictOfInterest();
    error NotRegistrar();
    error NotAParcelOwner();
    error AlreadyConsented();
    error NotEscrow();
    error ConsentsMissing();
    error VersionNotFound(uint256 parcelId, uint256 index);

    // Constants
    uint256 public constant MAX_OWNERS = 10;

    // Enums
    enum ParcelStatus { None, Submitted, SurveyVerified, Registered, UnderSale }
    enum VersionReason { Initial, Sale, Correction }

    // Structs
    struct Version {
        address[] owners;
        uint16[] shares;
        bytes32 docHash;
        string cid;
        uint64 timestamp;
        VersionReason reason;
    }

    // State
    IRoleManager public immutable roleManager;
    uint256 public parcelCount;

    mapping(uint256 => ParcelStatus) public status;
    mapping(uint256 => Version[]) public versions;
    mapping(uint256 => uint256) public consentRound;
    mapping(uint256 => uint256) public consentCount;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public consented;
    mapping(uint256 => address) public surveyedBy;

    // Events
    event ParcelSubmitted(uint256 indexed parcelId, address indexed submitter, bytes32 docHash, string cid);
    event SurveyVerified(uint256 indexed parcelId, address indexed surveyor);
    event ParcelRegistered(uint256 indexed parcelId, address indexed registrar);
    event SaleConsentGiven(uint256 indexed parcelId, address indexed owner);
    event ParcelLocked(uint256 indexed parcelId, address indexed lister);
    event ParcelUnlocked(uint256 indexed parcelId);
    event OwnershipTransferred(uint256 indexed parcelId, address indexed newOwner, uint256 versionIndex);

    /**
     * @notice Initializes the LandRegistry with a RoleManager.
     * @param roleManager_ Address of the IRoleManager contract.
     */
    constructor(IRoleManager roleManager_) {
        if (address(roleManager_) == address(0)) {
            revert ZeroAddress();
        }
        roleManager = roleManager_;
    }

    /**
     * @notice Submits a new parcel for registration.
     * @param owners Array of initial owners.
     * @param shares Array of shares (must sum to 100).
     * @param docHash Hash of the legal document.
     * @param cid Content identifier for off-chain metadata.
     * @return parcelId The ID of the newly created parcel.
     */
    function submitParcel(
        address[] calldata owners,
        uint16[] calldata shares,
        bytes32 docHash,
        string calldata cid
    ) external nonReentrant returns (uint256 parcelId) {
        // Validations
        if (owners.length != shares.length) revert LengthMismatch();
        if (owners.length == 0) revert NoOwners();
        if (owners.length > MAX_OWNERS) revert TooManyOwners();
        if (docHash == bytes32(0)) revert EmptyDocHash();
        if (bytes(cid).length == 0) revert EmptyCid();

        // Check for zero addresses, duplicates, zero shares, and sum = 100
        uint256 sum = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == address(0)) revert ZeroAddress();
            if (shares[i] == 0) revert ZeroShare();
            sum += shares[i];
            // Check duplicates
            for (uint256 j = i + 1; j < owners.length; j++) {
                if (owners[i] == owners[j]) revert DuplicateOwner();
            }
        }
        if (sum != 100) revert SharesMustSumTo100();

        // Submitter must be one of the owners
        bool submitterIsOwner = false;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == msg.sender) {
                submitterIsOwner = true;
                break;
            }
        }
        if (!submitterIsOwner) revert SubmitterNotAnOwner();

        // Create parcel
        parcelId = ++parcelCount;
        status[parcelId] = ParcelStatus.Submitted;
        _appendVersion(parcelId, owners, shares, docHash, cid, VersionReason.Initial);

        emit ParcelSubmitted(parcelId, msg.sender, docHash, cid);
    }

    /**
     * @notice Verifies the survey for a submitted parcel.
     * @param parcelId The ID of the parcel to verify.
     */
    function verifySurvey(uint256 parcelId) external nonReentrant {
        if (!roleManager.isSurveyor(msg.sender)) revert NotSurveyor();
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (status[parcelId] != ParcelStatus.Submitted) revert InvalidStatus(uint8(status[parcelId]), uint8(ParcelStatus.Submitted));

        // Conflict of interest: surveyor cannot be an owner
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        for (uint256 i = 0; i < latest.owners.length; i++) {
            if (latest.owners[i] == msg.sender) revert ConflictOfInterest();
        }

        status[parcelId] = ParcelStatus.SurveyVerified;
        surveyedBy[parcelId] = msg.sender;

        emit SurveyVerified(parcelId, msg.sender);
    }

    /**
     * @notice Approves registration of a surveyed parcel.
     * @param parcelId The ID of the parcel to register.
     */
    function approveRegistration(uint256 parcelId) external nonReentrant {
        if (!roleManager.isRegistrar(msg.sender)) revert NotRegistrar();
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (status[parcelId] != ParcelStatus.SurveyVerified) revert InvalidStatus(uint8(status[parcelId]), uint8(ParcelStatus.SurveyVerified));

        // Conflict of interest: registrar cannot be an owner
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        for (uint256 i = 0; i < latest.owners.length; i++) {
            if (latest.owners[i] == msg.sender) revert ConflictOfInterest();
        }

        status[parcelId] = ParcelStatus.Registered;

        emit ParcelRegistered(parcelId, msg.sender);
    }

    /**
     * @notice An owner consents to listing the parcel for fractional sale.
     * @param parcelId The ID of the parcel.
     */
    function consentToSale(uint256 parcelId) external nonReentrant {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (status[parcelId] != ParcelStatus.Registered) revert InvalidStatus(uint8(status[parcelId]), uint8(ParcelStatus.Registered));

        // Check caller is a current owner
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        bool callerIsOwner = false;
        for (uint256 i = 0; i < latest.owners.length; i++) {
            if (latest.owners[i] == msg.sender) {
                callerIsOwner = true;
                break;
            }
        }
        if (!callerIsOwner) revert NotAParcelOwner();

        uint256 round = consentRound[parcelId];
        if (consented[parcelId][round][msg.sender]) revert AlreadyConsented();

        consented[parcelId][round][msg.sender] = true;
        consentCount[parcelId]++;

        emit SaleConsentGiven(parcelId, msg.sender);
    }

    /**
     * @notice Locks a parcel for fractional sale (escrow only).
     * @param parcelId The ID of the parcel.
     * @param lister The owner listing the parcel.
     */
    function lockForSale(uint256 parcelId, address lister) external nonReentrant {
        if (!roleManager.isEscrow(msg.sender)) revert NotEscrow();
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (status[parcelId] != ParcelStatus.Registered) revert InvalidStatus(uint8(status[parcelId]), uint8(ParcelStatus.Registered));

        // Lister must be a current owner
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        bool listerIsOwner = false;
        for (uint256 i = 0; i < latest.owners.length; i++) {
            if (latest.owners[i] == lister) {
                listerIsOwner = true;
                break;
            }
        }
        if (!listerIsOwner) revert NotAParcelOwner();

        // All owners must have consented
        if (consentCount[parcelId] != latest.owners.length) revert ConsentsMissing();

        status[parcelId] = ParcelStatus.UnderSale;

        emit ParcelLocked(parcelId, lister);
    }

    /**
     * @notice Unlocks a parcel from sale (escrow only).
     * @param parcelId The ID of the parcel.
     */
    function unlockParcel(uint256 parcelId) external nonReentrant {
        if (!roleManager.isEscrow(msg.sender)) revert NotEscrow();
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (status[parcelId] != ParcelStatus.UnderSale) revert InvalidStatus(uint8(status[parcelId]), uint8(ParcelStatus.UnderSale));

        status[parcelId] = ParcelStatus.Registered;
        consentRound[parcelId]++;
        consentCount[parcelId] = 0;

        emit ParcelUnlocked(parcelId);
    }

    /**
     * @notice Transfers parcel ownership after sale (escrow only).
     * @param parcelId The ID of the parcel.
     * @param newOwner The new sole owner.
     */
    function transferParcel(uint256 parcelId, address newOwner) external nonReentrant {
        if (!roleManager.isEscrow(msg.sender)) revert NotEscrow();
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (status[parcelId] != ParcelStatus.UnderSale) revert InvalidStatus(uint8(status[parcelId]), uint8(ParcelStatus.UnderSale));
        if (newOwner == address(0)) revert ZeroAddress();

        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        address[] memory newOwners = new address[](1);
        newOwners[0] = newOwner;
        uint16[] memory newShares = new uint16[](1);
        newShares[0] = 100;

        uint256 newVersionIndex = _appendVersion(parcelId, newOwners, newShares, latest.docHash, latest.cid, VersionReason.Sale);

        status[parcelId] = ParcelStatus.Registered;
        consentRound[parcelId]++;
        consentCount[parcelId] = 0;

        emit OwnershipTransferred(parcelId, newOwner, newVersionIndex);
    }

    /**
     * @notice Internal helper to append a new version to a parcel.
     * @param id The parcel ID.
     * @param owners_ Array of owners.
     * @param shares_ Array of shares.
     * @param docHash Document hash.
     * @param cid Content identifier.
     * @param reason Reason for the new version.
     * @return versionIndex The index of the newly appended version.
     */
    function _appendVersion(
        uint256 id,
        address[] memory owners_,
        uint16[] memory shares_,
        bytes32 docHash,
        string memory cid,
        VersionReason reason
    ) internal returns (uint256) {
        Version storage v = versions[id].push();
        v.owners = owners_;
        v.shares = shares_;
        v.docHash = docHash;
        v.cid = cid;
        v.timestamp = uint64(block.timestamp);
        v.reason = reason;
        return versions[id].length - 1;
    }

    // ==================== VIEW FUNCTIONS ====================

    /**
     * @notice Gets the status of a parcel.
     * @param parcelId The parcel ID.
     * @return ParcelStatus The current status.
     */
    function getStatus(uint256 parcelId) public view returns (ParcelStatus) {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        return status[parcelId];
    }

    /**
     * @notice Gets the current owners and their shares.
     * @param parcelId The parcel ID.
     * @return owners Array of owner addresses.
     * @return shares Array of shares.
     */
    function getOwners(uint256 parcelId) public view returns (address[] memory, uint16[] memory) {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        return (latest.owners, latest.shares);
    }

    /**
     * @notice Gets the number of versions for a parcel.
     * @param parcelId The parcel ID.
     * @return count Number of versions.
     */
    function versionCount(uint256 parcelId) public view returns (uint256) {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        return versions[parcelId].length;
    }

    /**
     * @notice Gets a specific version of a parcel.
     * @param parcelId The parcel ID.
     * @param index The version index.
     * @return Version The version struct.
     */
    function getVersion(uint256 parcelId, uint256 index) public view returns (Version memory) {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        if (index >= versions[parcelId].length) revert VersionNotFound(parcelId, index);
        return versions[parcelId][index];
    }

    /**
     * @notice Verifies a presented document hash against the latest version.
     * @param parcelId The parcel ID.
     * @param presentedHash The hash to verify.
     * @return True if the hash matches.
     */
    function verifyDocument(uint256 parcelId, bytes32 presentedHash) public view returns (bool) {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        return latest.docHash == presentedHash;
    }

    /**
     * @notice Checks if an address is a current owner of a parcel.
     * @param parcelId The parcel ID.
     * @param account The address to check.
     * @return True if the address is an owner.
     */
    function isOwner(uint256 parcelId, address account) public view returns (bool) {
        if (status[parcelId] == ParcelStatus.None) revert ParcelNotFound(parcelId);
        Version storage latest = versions[parcelId][versions[parcelId].length - 1];
        for (uint256 i = 0; i < latest.owners.length; i++) {
            if (latest.owners[i] == account) return true;
        }
        return false;
    }
}