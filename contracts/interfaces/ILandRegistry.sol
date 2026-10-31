// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ILandRegistry
 * @notice Minimal interface for LandRegistry functions used by TitleEscrow.
 */
interface ILandRegistry {
    /**
     * @notice Locks a parcel for fractional sale.
     * @param parcelId The ID of the parcel.
     * @param lister The owner listing the parcel.
     */
    function lockForSale(uint256 parcelId, address lister) external;

    /**
     * @notice Unlocks a parcel from sale.
     * @param parcelId The ID of the parcel.
     */
    function unlockParcel(uint256 parcelId) external;

    /**
     * @notice Transfers parcel ownership after sale.
     * @param parcelId The ID of the parcel.
     * @param newOwner The new sole owner.
     */
    function transferParcel(uint256 parcelId, address newOwner) external;

    /**
     * @notice Gets the current owners and their shares.
     * @param parcelId The parcel ID.
     * @return owners Array of owner addresses.
     * @return shares Array of shares.
     */
    function getOwners(uint256 parcelId) external view returns (address[] memory, uint16[] memory);

    /**
     * @notice Checks if an address is a current owner of a parcel.
     * @param parcelId The parcel ID.
     * @param account The address to check.
     * @return True if the address is an owner.
     */
    function isOwner(uint256 parcelId, address account) external view returns (bool);
}