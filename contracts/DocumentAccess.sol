// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ILandRegistry.sol";

/**
 * @title DocumentAccess
 * @notice Key directory and audit log for encrypted parcel documents.
 * @dev Confidentiality is enforced by encryption, not by this contract.
 *      This contract is a key directory and audit log.
 */
contract DocumentAccess {
    ILandRegistry public immutable registry;
    mapping(address => bytes) private encryptionKeys;
    mapping(uint256 => uint32) public epochOf;
    mapping(uint256 => string) public rotatedCid;
    mapping(uint256 => mapping(uint32 => mapping(address => bytes))) private wrapped;

    uint256 public constant MAX_PUBLIC_KEY_BYTES = 1024;
    uint256 public constant MAX_WRAPPED_KEY_BYTES = 1024;
    uint256 public constant MAX_BATCH = 20;

    error ZeroAddress();
    error EmptyKey();
    error KeyTooLarge(uint256 size, uint256 max);
    error NoEncryptionKey(address account);
    error NotParcelOwner(uint256 parcelId, address caller);
    error NoAccess(uint256 parcelId, address account);
    error ArrayLengthMismatch();
    error EmptyBatch();
    error BatchTooLarge(uint256 size, uint256 max);
    error EmptyCid();

    event EncryptionKeyRegistered(address indexed account, bytes32 keyHash);
    event AccessRequested(uint256 indexed parcelId, address indexed requester);
    event AccessGranted(
        uint256 indexed parcelId,
        uint32 epoch,
        address indexed grantee,
        address indexed grantedBy
    );
    event AccessRevoked(
        uint256 indexed parcelId,
        uint32 epoch,
        address indexed grantee,
        address indexed grantedBy
    );
    event DocumentRotated(
        uint256 indexed parcelId,
        uint32 newEpoch,
        string newCid,
        address indexed rotatedBy
    );

    /**
     * @param registry_ The land registry used to resolve current parcel owners.
     */
    constructor(ILandRegistry registry_) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    /**
     * @notice Registers or replaces the caller's encryption public key.
     * @param publicKey The caller's encryption public key.
     */
    function registerEncryptionKey(bytes calldata publicKey) external {
        if (publicKey.length == 0) revert EmptyKey();
        if (publicKey.length > MAX_PUBLIC_KEY_BYTES) {
            revert KeyTooLarge(publicKey.length, MAX_PUBLIC_KEY_BYTES);
        }
        encryptionKeys[msg.sender] = publicKey;
        emit EncryptionKeyRegistered(msg.sender, keccak256(publicKey));
    }

    /**
     * @notice Records an access request after validating the parcel and requester key.
     * @param parcelId The parcel whose document is requested.
     */
    function requestAccess(uint256 parcelId) external {
        if (encryptionKeys[msg.sender].length == 0) revert NoEncryptionKey(msg.sender);
        registry.isOwner(parcelId, msg.sender);
        emit AccessRequested(parcelId, msg.sender);
    }

    /**
     * @notice Grants the current document epoch to a grantee.
     * @param parcelId The parcel whose document is shared.
     * @param grantee The account receiving the wrapped document key.
     * @param wrappedKey The document key wrapped for the grantee.
     */
    function grantAccess(uint256 parcelId, address grantee, bytes calldata wrappedKey) external {
        _requireOwner(parcelId);
        _validateGrant(grantee, wrappedKey);
        uint32 epoch = epochOf[parcelId];
        wrapped[parcelId][epoch][grantee] = wrappedKey;
        emit AccessGranted(parcelId, epoch, grantee, msg.sender);
    }

    /**
     * @notice Grants the current document epoch to multiple grantees atomically.
     * @param parcelId The parcel whose document is shared.
     * @param grantees Accounts receiving wrapped document keys.
     * @param keys Document keys wrapped for each grantee.
     */
    function grantAccessBatch(
        uint256 parcelId,
        address[] calldata grantees,
        bytes[] calldata keys
    ) external {
        _requireOwner(parcelId);
        _grantBatch(parcelId, grantees, keys);
    }

    /**
     * @notice Revokes a grantee's current-epoch access.
     * @param parcelId The parcel whose document is updated.
     * @param grantee The account losing access.
     */
    function revokeAccess(uint256 parcelId, address grantee) external {
        _requireOwner(parcelId);
        uint32 epoch = epochOf[parcelId];
        if (wrapped[parcelId][epoch][grantee].length == 0) {
            revert NoAccess(parcelId, grantee);
        }
        delete wrapped[parcelId][epoch][grantee];
        emit AccessRevoked(parcelId, epoch, grantee, msg.sender);
    }

    /**
     * @notice Rotates the document CID and grants the new epoch atomically.
     * @param parcelId The parcel whose document is rotated.
     * @param newCid The CID for the new encrypted document.
     * @param grantees Accounts receiving wrapped document keys.
     * @param keys Document keys wrapped for each grantee.
     */
    function rotateDocument(
        uint256 parcelId,
        string calldata newCid,
        address[] calldata grantees,
        bytes[] calldata keys
    ) external {
        _requireOwner(parcelId);
        if (bytes(newCid).length == 0) revert EmptyCid();
        uint32 newEpoch = epochOf[parcelId] + 1;
        epochOf[parcelId] = newEpoch;
        rotatedCid[parcelId] = newCid;
        emit DocumentRotated(parcelId, newEpoch, newCid, msg.sender);
        _grantBatch(parcelId, grantees, keys);
    }

    /**
     * @notice Returns an account's registered encryption public key.
     */
    function encryptionKeyOf(address account) external view returns (bytes memory) {
        return encryptionKeys[account];
    }

    /**
     * @notice Returns whether an account has access to the current document epoch.
     */
    function hasAccess(uint256 parcelId, address account) external view returns (bool) {
        return wrapped[parcelId][epochOf[parcelId]][account].length != 0;
    }

    /**
     * @notice Returns an account's wrapped key for the current document epoch.
     */
    function getWrappedKey(uint256 parcelId, address account) external view returns (bytes memory) {
        return wrapped[parcelId][epochOf[parcelId]][account];
    }

    /**
     * @notice Returns the rotated CID, or an empty string before the first rotation.
     */
    function rotatedCidOf(uint256 parcelId) external view returns (string memory) {
        return rotatedCid[parcelId];
    }

    function _requireOwner(uint256 parcelId) internal view {
        if (!registry.isOwner(parcelId, msg.sender)) {
            revert NotParcelOwner(parcelId, msg.sender);
        }
    }

    function _validateGrant(address grantee, bytes calldata wrappedKey) internal view {
        if (grantee == address(0)) revert ZeroAddress();
        if (wrappedKey.length == 0) revert EmptyKey();
        if (wrappedKey.length > MAX_WRAPPED_KEY_BYTES) {
            revert KeyTooLarge(wrappedKey.length, MAX_WRAPPED_KEY_BYTES);
        }
        if (encryptionKeys[grantee].length == 0) revert NoEncryptionKey(grantee);
    }

    function _grantBatch(
        uint256 parcelId,
        address[] calldata grantees,
        bytes[] calldata keys
    ) internal {
        if (grantees.length != keys.length) revert ArrayLengthMismatch();
        if (grantees.length == 0) revert EmptyBatch();
        if (grantees.length > MAX_BATCH) {
            revert BatchTooLarge(grantees.length, MAX_BATCH);
        }
        uint32 epoch = epochOf[parcelId];
        for (uint256 i = 0; i < grantees.length; i++) {
            _validateGrant(grantees[i], keys[i]);
        }
        for (uint256 i = 0; i < grantees.length; i++) {
            wrapped[parcelId][epoch][grantees[i]] = keys[i];
            emit AccessGranted(parcelId, epoch, grantees[i], msg.sender);
        }
    }
}
