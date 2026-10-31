// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IRoleManager
 * @notice Minimal interface for RoleManager role queries.
 */
interface IRoleManager {
    /**
     * @notice Checks if an account has REGISTRAR_ROLE.
     * @param account The address to check.
     * @return bool True if account has REGISTRAR_ROLE.
     */
    function isRegistrar(address account) external view returns (bool);

    /**
     * @notice Checks if an account has SURVEYOR_ROLE.
     * @param account The address to check.
     * @return bool True if account has SURVEYOR_ROLE.
     */
    function isSurveyor(address account) external view returns (bool);

    /**
     * @notice Checks if an account has ESCROW_ROLE.
     * @param account The address to check.
     * @return bool True if account has ESCROW_ROLE.
     */
    function isEscrow(address account) external view returns (bool);
}