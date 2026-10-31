// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BaselineRegistry
 * @notice Control system for evaluation: single-authority registry with no approvals,
 * no consent, and no escrow. Demonstrates the weaknesses the proposed system fixes.
 */
contract BaselineRegistry {
    // Custom Errors
    error ZeroAddress();
    error NotAuthority();
    error ParcelNotFound(uint256 parcelId);

    // State
    address public immutable authority;
    uint256 public parcelCount;

    struct Parcel {
        address owner;
        bytes32 docHash;
        string cid;
        bool exists;
    }

    mapping(uint256 => Parcel) private parcels;

    // Events
    event ParcelRegistered(uint256 indexed id, address indexed owner, bytes32 docHash, string cid);
    event OwnershipTransferred(uint256 indexed id, address indexed from, address indexed to);

    /**
     * @notice Initializes the BaselineRegistry with an authority.
     * @param authority_ The address with authority to register and transfer parcels.
     */
    constructor(address authority_) {
        if (authority_ == address(0)) {
            revert ZeroAddress();
        }
        authority = authority_;
    }

    /**
     * @notice Registers a new parcel. Only the authority may call.
     * @param owner The initial owner of the parcel.
     * @param docHash Hash of the legal document.
     * @param cid Content identifier for off-chain metadata.
     * @return id The ID of the newly created parcel.
     */
    function registerParcel(
        address owner,
        bytes32 docHash,
        string calldata cid
    ) external returns (uint256 id) {
        if (msg.sender != authority) revert NotAuthority();
        if (owner == address(0)) revert ZeroAddress();

        id = ++parcelCount;
        parcels[id] = Parcel({ owner: owner, docHash: docHash, cid: cid, exists: true });

        emit ParcelRegistered(id, owner, docHash, cid);
    }

    /**
     * @notice Transfers a parcel to a new owner. Only the authority may call.
     * @param id The ID of the parcel to transfer.
     * @param newOwner The new owner address.
     */
    function transferParcel(uint256 id, address newOwner) external {
        if (msg.sender != authority) revert NotAuthority();
        if (!parcels[id].exists) revert ParcelNotFound(id);
        if (newOwner == address(0)) revert ZeroAddress();

        address from = parcels[id].owner;
        parcels[id].owner = newOwner;

        emit OwnershipTransferred(id, from, newOwner);
    }

    /**
     * @notice Gets the owner of a parcel.
     * @param id The ID of the parcel.
     * @return The owner address.
     */
    function ownerOf(uint256 id) external view returns (address) {
        if (!parcels[id].exists) revert ParcelNotFound(id);
        return parcels[id].owner;
    }

    /**
     * @notice Verifies a presented document hash against the registered hash.
     * @param id The ID of the parcel.
     * @param presentedHash The hash to verify.
     * @return True if the hash matches.
     */
    function verifyDocument(uint256 id, bytes32 presentedHash) external view returns (bool) {
        if (!parcels[id].exists) revert ParcelNotFound(id);
        return parcels[id].docHash == presentedHash;
    }
}