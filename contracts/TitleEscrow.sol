// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRoleManager} from "./interfaces/IRoleManager.sol";
import {ILandRegistry} from "./interfaces/ILandRegistry.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TitleEscrow
 * @notice Safe-sale machine for land parcels. Holds buyer funds and completes
 * atomic transfer when both seller and registrar approve. Uses pull payments.
 */
contract TitleEscrow is ReentrancyGuard {
    // Custom Errors
    error ZeroAddress();
    error InvalidPrice();
    error NotParcelOwner();
    error DealExists(uint256 parcelId);
    error NoActiveDeal(uint256 parcelId);
    error WrongDealStatus(uint8 current, uint8 expected);
    error NotSeller();
    error WrongAmount(uint256 sent, uint256 expected);
    error BuyerIsOwner();
    error DealExpired();
    error AlreadyApproved();
    error NotRegistrar();
    error ConflictOfInterest();
    error DeadlineNotReached();
    error NothingToWithdraw();
    error TransferFailed();

    // Constants
    uint64 public constant DEAL_WINDOW = 7 days;

    // Enums
    enum DealStatus { None, Listed, Funded }

    // Structs
    struct Deal {
        address seller;
        address buyer;
        uint256 price;
        uint64 deadline;
        bool sellerApproved;
        bool registrarApproved;
        DealStatus status;
    }

    // State
    IRoleManager public immutable roleManager;
    ILandRegistry public immutable registry;

    mapping(uint256 => Deal) private deals;           // parcelId => deal
    mapping(address => uint256) public pendingWithdrawals;

    // Events
    event Listed(uint256 indexed parcelId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed parcelId);
    event Deposited(uint256 indexed parcelId, address indexed buyer, uint256 amount, uint64 deadline);
    event Approved(uint256 indexed parcelId, address indexed approver, bool isSeller);
    event SaleCompleted(uint256 indexed parcelId, address indexed seller, address indexed buyer, uint256 price);
    event Refunded(uint256 indexed parcelId, address indexed buyer, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    /**
     * @notice Initializes the TitleEscrow with RoleManager and LandRegistry.
     * @param roleManager_ Address of the IRoleManager contract.
     * @param registry_ Address of the ILandRegistry contract.
     */
    constructor(IRoleManager roleManager_, ILandRegistry registry_) {
        if (address(roleManager_) == address(0) || address(registry_) == address(0)) {
            revert ZeroAddress();
        }
        roleManager = roleManager_;
        registry = registry_;
    }

    /**
     * @notice Lists a parcel for sale. Called by the owner (seller).
     * @param parcelId The ID of the parcel to list.
     * @param price The sale price in wei (must be > 0).
     */
    function listParcel(uint256 parcelId, uint256 price) external {
        if (price == 0) revert InvalidPrice();

        if (!registry.isOwner(parcelId, msg.sender)) revert NotParcelOwner();

        if (deals[parcelId].status != DealStatus.None) revert DealExists(parcelId);

        // EFFECTS first: save deal before external call
        deals[parcelId] = Deal({
            seller: msg.sender,
            buyer: address(0),
            price: price,
            deadline: 0,
            sellerApproved: false,
            registrarApproved: false,
            status: DealStatus.Listed
        });

        // Then call registry to lock the parcel
        registry.lockForSale(parcelId, msg.sender);

        emit Listed(parcelId, msg.sender, price);
    }

    /**
     * @notice Cancels a listing before any buyer deposits. Called by the seller.
     * @param parcelId The ID of the parcel.
     */
    function cancelListing(uint256 parcelId) external {
        Deal storage deal = deals[parcelId];
        if (deal.status != DealStatus.Listed) {
            revert WrongDealStatus(uint8(deal.status), uint8(DealStatus.Listed));
        }
        if (msg.sender != deal.seller) revert NotSeller();

        // EFFECTS first: delete deal before external call
        delete deals[parcelId];

        // Then unlock in registry
        registry.unlockParcel(parcelId);

        emit ListingCancelled(parcelId);
    }

    /**
     * @notice Buyer deposits the exact price to fund the deal.
     * @param parcelId The ID of the parcel.
     */
    function deposit(uint256 parcelId) external payable {
        Deal storage deal = deals[parcelId];

        if (deal.status == DealStatus.None) revert NoActiveDeal(parcelId);
        if (deal.status != DealStatus.Listed) {
            revert WrongDealStatus(uint8(deal.status), uint8(DealStatus.Listed));
        }

        if (msg.value != deal.price) revert WrongAmount(msg.value, deal.price);

        if (registry.isOwner(parcelId, msg.sender)) revert BuyerIsOwner();

        deal.buyer = msg.sender;
        deal.status = DealStatus.Funded;
        deal.deadline = uint64(block.timestamp) + DEAL_WINDOW;

        emit Deposited(parcelId, msg.sender, msg.value, deal.deadline);
    }

    /**
     * @notice Seller approves the sale. Called by the listing seller.
     * @param parcelId The ID of the parcel.
     */
    function approveAsSeller(uint256 parcelId) external {
        Deal storage deal = deals[parcelId];

        if (deal.status != DealStatus.Funded) {
            revert WrongDealStatus(uint8(deal.status), uint8(DealStatus.Funded));
        }
        if (msg.sender != deal.seller) revert NotSeller();
        if (block.timestamp > deal.deadline) revert DealExpired();
        if (deal.sellerApproved) revert AlreadyApproved();

        deal.sellerApproved = true;
        emit Approved(parcelId, msg.sender, true);
        _tryComplete(parcelId);
    }

    /**
     * @notice Registrar approves the sale as lawful. Called by a registrar.
     * @param parcelId The ID of the parcel.
     */
    function approveAsRegistrar(uint256 parcelId) external {
        if (!roleManager.isRegistrar(msg.sender)) revert NotRegistrar();

        Deal storage deal = deals[parcelId];

        if (deal.status != DealStatus.Funded) {
            revert WrongDealStatus(uint8(deal.status), uint8(DealStatus.Funded));
        }
        if (block.timestamp > deal.deadline) revert DealExpired();
        if (deal.registrarApproved) revert AlreadyApproved();

        // Conflict of interest: registrar cannot be buyer or owner
        if (msg.sender == deal.buyer || registry.isOwner(parcelId, msg.sender)) {
            revert ConflictOfInterest();
        }

        deal.registrarApproved = true;
        emit Approved(parcelId, msg.sender, false);
        _tryComplete(parcelId);
    }

    /**
     * @notice Internal: if both approvals exist, complete the sale.
     * @param parcelId The ID of the parcel.
     */
    function _tryComplete(uint256 parcelId) internal {
        Deal storage deal = deals[parcelId];
        if (deal.sellerApproved && deal.registrarApproved) {
            _completeSale(parcelId);
        }
    }

    /**
     * @notice Internal: executes the sale - credits payouts and transfers parcel.
     * @param parcelId The ID of the parcel.
     */
    function _completeSale(uint256 parcelId) internal {
        // Read deal into memory before deletion
        Deal memory deal = deals[parcelId];
        address seller = deal.seller;
        address buyer = deal.buyer;
        uint256 price = deal.price;

        // Get current owners and shares for pro-rata split
        (address[] memory owners, uint16[] memory shares) = registry.getOwners(parcelId);

        // EFFECTS first: delete deal and credit withdrawals
        delete deals[parcelId];

        uint256 totalPaid = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            uint256 shareAmount = (price * shares[i]) / 100;
            pendingWithdrawals[owners[i]] += shareAmount;
            totalPaid += shareAmount;
        }

        // Rounding remainder goes to the seller
        if (price > totalPaid) {
            pendingWithdrawals[seller] += price - totalPaid;
        }

        // Then external call to transfer parcel
        registry.transferParcel(parcelId, buyer);

        emit SaleCompleted(parcelId, seller, buyer, price);
    }

    /**
     * @notice Refunds buyer after 7-day deadline passes without full approval.
     * @param parcelId The ID of the parcel.
     */
    function refundAfterDeadline(uint256 parcelId) external {
        Deal storage deal = deals[parcelId];

        if (deal.status != DealStatus.Funded) {
            revert WrongDealStatus(uint8(deal.status), uint8(DealStatus.Funded));
        }
        if (block.timestamp <= deal.deadline) revert DeadlineNotReached();

        address buyer = deal.buyer;
        uint256 price = deal.price;

        // EFFECTS first: delete deal and credit withdrawal
        delete deals[parcelId];
        pendingWithdrawals[buyer] += price;

        // Then unlock in registry
        registry.unlockParcel(parcelId);

        emit Refunded(parcelId, buyer, price);
    }

    /**
     * @notice Withdraws owed funds using pull payment pattern.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // EFFECTS first: clear balance before external call
        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Gets the deal for a parcel.
     * @param parcelId The ID of the parcel.
     * @return Deal The deal struct.
     */
    function getDeal(uint256 parcelId) external view returns (Deal memory) {
        return deals[parcelId];
    }
}