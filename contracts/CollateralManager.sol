// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/ICollateralManager.sol";
import "./interfaces/ILoanProcessor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CollateralManager Contract
/// @notice Handles the deposit, locking, and withdrawal of collateral for loans managed by LoanProcessor.
/// @dev Interacts closely with LoanProcessor to manage collateral lifecycle based on loan status.
contract CollateralManager is ICollateralManager, Ownable {
    using SafeERC20 for IERC20;

    // Use the struct defined in the interface
    // struct CollateralInfo { ... } // Now inherited via ICollateralManager

    // --- State Variables ---
    /// @notice Mapping from loan ID to the collateral information for that loan.
    mapping(uint256 => CollateralInfo) private loanCollateral;
    /// @notice Mapping from token address to its support status.
    mapping(address => bool) public override isTokenSupported;
    /// @notice Address of the LoanProcessor contract.
    address public override loanProcessorAddress;

    // --- Constants ---
    uint256 private constant BPS_DENOMINATOR = 10000;

    // --- Modifiers ---
    /// @dev Restricts function calls to the registered LoanProcessor contract address.
    modifier onlyLoanProcessor() {
        require(msg.sender == loanProcessorAddress, "CM: Caller is not LoanProcessor");
        _;
    }

    // --- Constructor ---
    /// @notice Contract constructor.
    /// @param _initialOwner The address designated as the initial owner.
    constructor(address _initialOwner) Ownable(_initialOwner) {}

    // --- External Functions: Admin ---
    /// @notice Sets the address of the LoanProcessor contract.
    /// @dev Can only be called by the contract owner.
    /// @param _loanProcessorAddress The new address of the LoanProcessor.
    function setLoanProcessor(address _loanProcessorAddress) external override onlyOwner {
        require(_loanProcessorAddress != address(0), "CM: Invalid LoanProcessor address");
        loanProcessorAddress = _loanProcessorAddress;
        emit LoanProcessorAddressSet(_loanProcessorAddress);
    }

    /// @notice Sets whether an ERC20 token is supported as collateral.
    /// @dev Can only be called by the contract owner.
    /// @param token The address of the token.
    /// @param isSupported True if the token is supported, false otherwise.
    function setSupportedToken(address token, bool isSupported) external override onlyOwner {
        require(token != address(0), "CM: Invalid token address");
        isTokenSupported[token] = isSupported;
        emit SupportedTokenSet(token, isSupported);
    }

    // --- External Functions: Collateral Lifecycle ---
    /// @notice Allows a user to deposit collateral to initiate a loan creation process.
    /// @dev Transfers tokens to this contract and notifies the LoanProcessor.
    /// @param token The address of the ERC20 token being deposited.
    /// @param amount The amount of the token being deposited.
    function depositCollateral(address token, uint256 amount) external override {
        require(loanProcessorAddress != address(0), "CM: LoanProcessor not set");
        require(amount > 0, "CM: Amount must be positive");
        require(isTokenSupported[token], "CM: Token not supported");

        // 1. Pull tokens to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // 2. Notify LoanProcessor to create the loan
        // LoanProcessor will call back `storeCollateralInfo` to link loanId and collateral details.
        ILoanProcessor(loanProcessorAddress).notifyCollateralLockedAndCreateLoan(msg.sender, token, amount);

        emit CollateralDeposited(msg.sender, token, amount);
    }

    /// @notice Called by LoanProcessor during loan creation to store collateral details against the loan ID.
    /// @dev Prevents overwriting existing collateral info for a loan ID.
    /// @param loanId The ID of the new loan.
    /// @param user The borrower's address.
    /// @param token The collateral token address.
    /// @param amount The amount of collateral locked.
    function storeCollateralInfo(uint256 loanId, address user, address token, uint256 amount) external override onlyLoanProcessor {
        require(loanCollateral[loanId].owner == address(0), "CM: Collateral info already stored"); // Prevent overwriting
        require(user != address(0) && token != address(0) && amount > 0, "CM: Invalid collateral parameters");

        loanCollateral[loanId] = CollateralInfo({
            token: token,
            amount: amount,
            owner: user,
            withdrawalAuthorized: false,
            authorizedWithdrawAmount: 0 // Initialize explicitly
        });
        // No event here, LoanProcessor emits LoanCreated
    }

    /// @notice Called by LoanProcessor to authorize the withdrawal of the full collateral amount (e.g., on loan completion).
    /// @param loanId The ID of the loan.
    /// @param user The address of the borrower (validated by LoanProcessor).
    /// @param token The address of the collateral token (validated by LoanProcessor).
    function authorizeWithdrawal(uint256 loanId, address user, address token) external override onlyLoanProcessor {
        CollateralInfo storage collateral = loanCollateral[loanId];
        require(collateral.owner == user, "CM: User mismatch"); // Double check
        require(collateral.token == token, "CM: Token mismatch"); // Double check
        require(collateral.amount > 0, "CM: No collateral stored");
        require(!collateral.withdrawalAuthorized, "CM: Already authorized");

        collateral.withdrawalAuthorized = true;
        collateral.authorizedWithdrawAmount = collateral.amount; // Authorize full amount

        emit WithdrawalAuthorized(loanId, user, token);
    }

    /// @notice Called by LoanProcessor to authorize withdrawal less an early termination fee.
    /// @dev Calculates the fee, determines the net withdrawal amount, and sets authorization.
    /// @param loanId The ID of the loan being terminated early.
    /// @param feeBps The early termination fee in basis points (e.g., 500 = 5%).
    function authorizeWithdrawalWithFee(uint256 loanId, uint256 feeBps) external override onlyLoanProcessor {
        CollateralInfo storage collateral = loanCollateral[loanId];
        require(collateral.owner != address(0), "CM: Collateral not found");
        require(collateral.amount > 0, "CM: No collateral stored");
        require(!collateral.withdrawalAuthorized, "CM: Already authorized");
        require(feeBps <= BPS_DENOMINATOR, "CM: Fee cannot exceed 100%");

        uint256 feeAmount = (collateral.amount * feeBps) / BPS_DENOMINATOR;
        uint256 amountToAuthorize = collateral.amount - feeAmount;

        collateral.withdrawalAuthorized = true;
        collateral.authorizedWithdrawAmount = amountToAuthorize;

        // Note: The fee amount remains in this contract. Needs separate sweep/claim mechanism for the platform.
        // Or, could transfer fee immediately to LoanProcessor owner? (Adds complexity/gas/re-entrancy risk)

        emit WithdrawalAuthorizedWithFee(loanId, collateral.owner, collateral.token, feeAmount, amountToAuthorize);
    }

    /// @notice Called by the user (borrower) to withdraw their collateral after it has been authorized.
    /// @dev Transfers the `authorizedWithdrawAmount` if set, otherwise the full original amount.
    /// @param loanId The ID of the loan whose collateral is being withdrawn.
    function withdrawCollateral(uint256 loanId) external override {
        CollateralInfo storage collateral = loanCollateral[loanId];
        require(msg.sender == collateral.owner, "CM: Not collateral owner");
        require(collateral.withdrawalAuthorized, "CM: Withdrawal not authorized");

        // Determine the amount to withdraw: specific authorized amount (fee scenario) or full amount
        uint256 amountToWithdraw;
        if (collateral.authorizedWithdrawAmount > 0) {
            // Handles both full withdrawal (set in authorizeWithdrawal) and fee-deducted withdrawal
            amountToWithdraw = collateral.authorizedWithdrawAmount;
            require(collateral.amount >= amountToWithdraw, "CM: Internal error - Inconsistent state"); // Sanity check
        } else {
            // Should not happen if authorization logic is correct, but as fallback:
            require(collateral.amount > 0, "CM: No collateral to withdraw (zero amount)");
            amountToWithdraw = collateral.amount;
        }

        // Reset state BEFORE transfer (prevents re-entrancy)
        uint256 originalAmount = collateral.amount;
        address token = collateral.token;
        // Clear struct fields to prevent re-use and save gas refund
        delete loanCollateral[loanId]; // Deletes the whole struct

        // Transfer collateral back to user
        IERC20(token).safeTransfer(msg.sender, amountToWithdraw);

        // If fee was deducted, the remaining amount (fee) is left in the contract.
        // The platform needs a separate mechanism to sweep/claim these fees.

        emit CollateralWithdrawn(msg.sender, token, amountToWithdraw);
    }

    /// @notice Called by LoanProcessor to claim collateral from a defaulted loan.
    /// @dev Verifies loan status with LoanProcessor before transferring collateral.
    /// @param loanId The ID of the defaulted loan.
    /// @param recipient The address to receive the claimed collateral (e.g., platform treasury or owner).
    function claimDefaultedCollateral(uint256 loanId, address recipient) external override onlyLoanProcessor {
        require(recipient != address(0), "CM: Invalid recipient");
        CollateralInfo storage collateral = loanCollateral[loanId];
        require(collateral.owner != address(0), "CM: Collateral not found");
        require(collateral.amount > 0, "CM: No collateral to claim");
        require(!collateral.withdrawalAuthorized, "CM: Withdrawal already authorized for user"); // Cannot claim if user can withdraw

        // Verify with LoanProcessor that the loan is actually defaulted
        ILoanProcessor loanProcessor = ILoanProcessor(loanProcessorAddress);
        ILoanProcessor.Loan memory loan = loanProcessor.getLoanDetails(loanId);
        require(loan.status == ILoanProcessor.LoanStatus.Defaulted, "CM: Loan not defaulted according to LP");

        uint256 claimAmount = collateral.amount;
        address token = collateral.token;

        // Clear state BEFORE transfer
        delete loanCollateral[loanId];

        // Transfer collateral to recipient
        IERC20(token).safeTransfer(recipient, claimAmount);

        emit DefaultedCollateralClaimed(loanId, token, claimAmount, recipient);
    }

    // --- Fee Sweeping Function ---
    /// @notice Transfers the contract's entire balance of a specific ERC20 token (accumulated fees) to a recipient.
    /// @dev Should only be called by the owner for supported collateral tokens where fees might accumulate.
    /// @param token The address of the ERC20 fee token to sweep.
    /// @param recipient The address to receive the swept fees.
    function sweepFees(address token, address recipient) external override onlyOwner {
        require(recipient != address(0), "CM: Invalid recipient");
        require(token != address(0), "CM: Invalid token address");
        // Optional: Check if token is supported? Might want to sweep arbitrary tokens sent by mistake.
        // require(isTokenSupported[token], "CM: Sweeping unsupported token balance");
        IERC20 feeToken = IERC20(token);
        uint256 balance = feeToken.balanceOf(address(this));

        if (balance > 0) {
            feeToken.safeTransfer(recipient, balance);
            // Emit an event? e.g., FeesSwept(address indexed token, address indexed recipient, uint256 amount);
        }
        // No revert if balance is 0, just do nothing.
    }

    // --- View Functions ---
    /// @notice Retrieves the originally locked collateral amount and token for a specific loan ID.
    /// @param loanId The ID of the loan.
    /// @return token The address of the collateral token.
    /// @return amount The original amount of collateral locked.
    function getLockedCollateral(uint256 loanId) external view override returns (address token, uint256 amount) {
        // Returns the original amount, not the potentially reduced authorized amount
        return (loanCollateral[loanId].token, loanCollateral[loanId].amount);
    }

    /// @notice Retrieves the full collateral information struct for a loan ID.
    /// @param loanId The ID of the loan.
    /// @return info The CollateralInfo struct.
    function getCollateralInfo(uint256 loanId) external view override returns (CollateralInfo memory info) {
        return loanCollateral[loanId];
    }
}