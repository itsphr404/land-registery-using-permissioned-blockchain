// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReentrancyAttacker
 * @notice Test helper that simulates a malicious seller attempting reentrancy attacks.
 * Not for production use.
 */

// Minimal interfaces for testing
interface IRegistry {
    function submitParcel(address[] calldata owners, uint16[] calldata shares, bytes32 docHash, string calldata cid) external returns (uint256);
    function consentToSale(uint256 parcelId) external;
}

interface IEscrow {
    function listParcel(uint256 parcelId, uint256 price) external;
    function approveAsSeller(uint256 parcelId) external;
    function withdraw() external;
}

contract ReentrancyAttacker {
    // State
    IEscrow public target;
    bool public reentryAttempted;
    bool public reentryBlocked;
    bool public revertOnReceive;
    bytes public lastRevertData;

    // === Helper functions acting as a malicious seller ===

    /**
     * @notice Submits a parcel with this contract as sole owner.
     * @param registry The registry contract address.
     * @param docHash Document hash.
     * @param cid Content identifier.
     * @return parcelId The created parcel ID.
     */
    function submitParcel(address registry, bytes32 docHash, string calldata cid) external returns (uint256) {
        address[] memory owners = new address[](1);
        owners[0] = address(this);
        uint16[] memory shares = new uint16[](1);
        shares[0] = 100;
        return IRegistry(registry).submitParcel(owners, shares, docHash, cid);
    }

    /**
     * @notice Consents to sale for a parcel.
     * @param registry The registry contract address.
     * @param parcelId The parcel ID.
     */
    function consent(address registry, uint256 parcelId) external {
        IRegistry(registry).consentToSale(parcelId);
    }

    /**
     * @notice Lists a parcel for sale.
     * @param escrow The escrow contract address.
     * @param parcelId The parcel ID.
     * @param price The sale price.
     */
    function list(address escrow, uint256 parcelId, uint256 price) external {
        IEscrow(escrow).listParcel(parcelId, price);
    }

    /**
     * @notice Approves the sale as seller.
     * @param escrow The escrow contract address.
     * @param parcelId The parcel ID.
     */
    function approve(address escrow, uint256 parcelId) external {
        IEscrow(escrow).approveAsSeller(parcelId);
    }

    // === Reentrancy attack vector ===

    /**
     * @notice Initiates a reentrancy attack on withdraw.
     * @param escrow The escrow contract to attack.
     */
    function attackWithdraw(address escrow) external {
        target = IEscrow(escrow);
        reentryAttempted = false;
        reentryBlocked = false;
        target.withdraw();
    }

    /**
     * @notice Sets whether receive() should revert.
     * @param value True to force revert on receive.
     */
    function setRevertOnReceive(bool value) external {
        revertOnReceive = value;
    }

    /**
     * @notice Receive hook - records that ETH was received (proves reentrancy window opened).
     * The TitleEscrow's nonReentrant modifier on withdraw() prevents actual reentrant calls.
     */
    receive() external payable {
        if (revertOnReceive) revert("ReentrancyAttacker: forced revert");
        if (!reentryAttempted) {
            reentryAttempted = true;
            try target.withdraw() { reentryBlocked = false; }
            catch (bytes memory reason) { reentryBlocked = true; lastRevertData = reason; }
        }
    }
}