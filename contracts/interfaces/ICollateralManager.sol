// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ILoanProcessor.sol"; // Import needed for checking loan status

/// @notice Interface for the CollateralManager contract.
interface ICollateralManager {

    /// @notice Details of the collateral locked for a specific loan.
    struct CollateralInfo {
        address token;                  // Address of the ERC20 collateral token
        uint256 amount;                 // Original amount deposited
        address owner;                  // Borrower's address (owner of the collateral)
        bool withdrawalAuthorized;      // Flag indicating if withdrawal is permitted
        uint256 authorizedWithdrawAmount; // Specific amount authorized for withdrawal (used for fees)
    }

    // --- Events ---
    /// @notice Emitted when a user successfully deposits collateral.
    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    /// @notice Emitted when a user successfully withdraws their authorized collateral.
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    /// @notice Emitted when withdrawal is authorized by the LoanProcessor (full amount).
    event WithdrawalAuthorized(uint256 indexed loanId, address indexed user, address indexed token);
    /// @notice Emitted when withdrawal is authorized by the LoanProcessor with an early termination fee deduction.
    event WithdrawalAuthorizedWithFee(uint256 indexed loanId, address indexed user, address indexed token, uint256 feeAmount, uint256 amountAuthorized);
    /// @notice Emitted when collateral from a defaulted loan is claimed by the platform.
    event DefaultedCollateralClaimed(uint256 indexed loanId, address indexed token, uint256 amount, address recipient);
    /// @notice Emitted when the LoanProcessor contract address is set or updated.
    event LoanProcessorAddressSet(address indexed loanProcessorAddress);
    /// @notice Emitted when a token's support status is changed.
    event SupportedTokenSet(address indexed token, bool isSupported);

    // --- State Modifying Functions ---
    /// @notice Allows a user to deposit collateral to initiate a loan creation process.
    /// @param token The address of the ERC20 token being deposited.
    /// @param amount The amount of the token being deposited.
    function depositCollateral(address token, uint256 amount) external;

    /// @notice Called by the user (borrower) to withdraw their collateral after it has been authorized.
    /// @dev Will transfer the amount specified during authorization (full or less fee).
    /// @param loanId The ID of the loan whose collateral is being withdrawn.
    function withdrawCollateral(uint256 loanId) external;

    /// @notice Called by LoanProcessor to authorize the withdrawal of the full collateral amount (e.g., on loan completion).
    /// @param loanId The ID of the loan.
    /// @param user The address of the borrower.
    /// @param token The address of the collateral token.
    function authorizeWithdrawal(uint256 loanId, address user, address token) external;

    /// @notice Called by LoanProcessor to authorize withdrawal less an early termination fee.
    /// @param loanId The ID of the loan being terminated early.
    /// @param feeBps The early termination fee in basis points (e.g., 500 = 5%).
    function authorizeWithdrawalWithFee(uint256 loanId, uint256 feeBps) external;

    /// @notice Called by LoanProcessor to claim collateral from a defaulted loan.
    /// @param loanId The ID of the defaulted loan.
    /// @param recipient The address to receive the claimed collateral.
    function claimDefaultedCollateral(uint256 loanId, address recipient) external;

    /// @notice Called by LoanProcessor during loan creation to store collateral details against the loan ID.
    /// @param loanId The ID of the new loan.
    /// @param user The borrower's address.
    /// @param token The collateral token address.
    /// @param amount The amount of collateral locked.
    function storeCollateralInfo(uint256 loanId, address user, address token, uint256 amount) external;

    /// @notice Transfers accumulated fees (collateral tokens left after early withdrawals) to a recipient.
    /// @dev Typically called by the owner or platform treasury.
    /// @param token The address of the ERC20 fee token to sweep.
    /// @param recipient The address to receive the swept fees.
    function sweepFees(address token, address recipient) external;

    /// @notice Sets the address of the LoanProcessor contract. Called by admin.
    /// @param _loanProcessorAddress The new address of the LoanProcessor.
    function setLoanProcessor(address _loanProcessorAddress) external;

    /// @notice Sets whether an ERC20 token is supported as collateral. Called by admin.
    /// @param token The address of the token.
    /// @param isSupported True if the token is supported, false otherwise.
    function setSupportedToken(address token, bool isSupported) external;

    // --- View Functions ---
    /// @notice Checks if a given token is supported for collateral deposits.
    /// @param token The address of the token.
    /// @return True if the token is supported, false otherwise.
    function isTokenSupported(address token) external view returns (bool);

    /// @notice Retrieves the locked collateral details for a specific loan ID.
    /// @param loanId The ID of the loan.
    /// @return token The address of the collateral token.
    /// @return amount The amount of collateral currently locked.
    function getLockedCollateral(uint256 loanId) external view returns (address token, uint256 amount);

    /// @notice Retrieves the full collateral information struct for a loan ID.
    /// @param loanId The ID of the loan.
    /// @return info The CollateralInfo struct.
    function getCollateralInfo(uint256 loanId) external view returns (CollateralInfo memory info);

    /// @notice Retrieves the address of the associated LoanProcessor contract.
    /// @return The address of the LoanProcessor.
    function loanProcessorAddress() external view returns (address);
}