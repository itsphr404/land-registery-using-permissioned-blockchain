// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title RoleManager
 * @notice Manages role-based access control for the land registry system.
 * Enforces separation of duties: an account can hold at most one of
 * REGISTRAR_ROLE, SURVEYOR_ROLE, or COURT_ROLE.
 */
contract RoleManager is AccessControl {
    // Custom Errors
    error ZeroAddress();
    error ConflictingRole(address account, bytes32 heldRole, bytes32 newRole);

    // Role Identifiers
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant SURVEYOR_ROLE = keccak256("SURVEYOR_ROLE");
    bytes32 public constant COURT_ROLE = keccak256("COURT_ROLE");
    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    /**
     * @notice Initializes the RoleManager with an admin.
     * @param admin The address to grant DEFAULT_ADMIN_ROLE. Must not be zero.
     */
    constructor(address admin) {
        if (admin == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Internal function to grant a role, enforcing separation of duties.
     * @param role The role to grant.
     * @param account The account to grant the role to.
     * @return bool True if role was granted.
     */
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        // Check for conflicting roles among REGISTRAR_ROLE, SURVEYOR_ROLE, COURT_ROLE
        if (role == REGISTRAR_ROLE || role == SURVEYOR_ROLE || role == COURT_ROLE) {
            if (hasRole(REGISTRAR_ROLE, account) && role != REGISTRAR_ROLE) {
                revert ConflictingRole(account, REGISTRAR_ROLE, role);
            }
            if (hasRole(SURVEYOR_ROLE, account) && role != SURVEYOR_ROLE) {
                revert ConflictingRole(account, SURVEYOR_ROLE, role);
            }
            if (hasRole(COURT_ROLE, account) && role != COURT_ROLE) {
                revert ConflictingRole(account, COURT_ROLE, role);
            }
        }
        return super._grantRole(role, account);
    }

    /**
     * @notice Checks if an account has REGISTRAR_ROLE.
     * @param account The address to check.
     * @return bool True if account has REGISTRAR_ROLE.
     */
    function isRegistrar(address account) public view returns (bool) {
        return hasRole(REGISTRAR_ROLE, account);
    }

    /**
     * @notice Checks if an account has SURVEYOR_ROLE.
     * @param account The address to check.
     * @return bool True if account has SURVEYOR_ROLE.
     */
    function isSurveyor(address account) public view returns (bool) {
        return hasRole(SURVEYOR_ROLE, account);
    }

    /**
     * @notice Checks if an account has COURT_ROLE.
     * @param account The address to check.
     * @return bool True if account has COURT_ROLE.
     */
    function isCourt(address account) public view returns (bool) {
        return hasRole(COURT_ROLE, account);
    }

    /**
     * @notice Checks if an account has ESCROW_ROLE.
     * @param account The address to check.
     * @return bool True if account has ESCROW_ROLE.
     */
    function isEscrow(address account) public view returns (bool) {
        return hasRole(ESCROW_ROLE, account);
    }

    /**
     * @notice Checks if an account has ISSUER_ROLE.
     * @param account The address to check.
     * @return bool True if account has ISSUER_ROLE.
     */
    function isIssuer(address account) public view returns (bool) {
        return hasRole(ISSUER_ROLE, account);
    }
}