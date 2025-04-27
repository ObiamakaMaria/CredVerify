// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IPaymentHandler.sol";
import "./ICollateralManager.sol"; // Added import for dependent struct if needed
import "./ICreditScorer.sol"; // Added import for ICreditScorer
import "./IReputationNFT.sol"; // Added import for IReputationNFT

interface ILoanProcessor {
    /// @notice Represents the possible states of a loan.
    enum LoanStatus {
        Pending,        // Initial state before collateral lock confirmation (if needed)
        Active,         // Loan is ongoing, payments expected
        PaidInFull,     // Loan fully repaid successfully
        Defaulted,      // Loan considered defaulted due to missed payments
        EarlyTerminated // Loan terminated by borrower before full repayment
    }

    /// @notice Structure holding all details for a credit builder loan.
    struct Loan {
        uint256 id;                     // Unique identifier for the loan
        address borrower;               // Address of the user who took the loan
        address collateralToken;        // Address of the ERC20 token used as collateral
        uint256 collateralAmount;       // Amount of collateral locked
        uint256 principalAmount;        // The initial loan amount (usually == collateralAmount)
        uint256 annualInterestRateBps;  // Annual interest rate in basis points (e.g., 800 = 8.00%)
        uint256 startTime;              // Timestamp when the loan became active
        uint256 duration;               // Intended duration of the loan in seconds
        uint256 nextDueDate;            // Timestamp when the next payment is due
        LoanStatus status;              // Current status of the loan
        uint256 paymentsMade;           // Counter for the number of payments made
        uint128 totalPaidPrincipal;     // Accumulated principal repaid
        uint128 totalPaidInterest;      // Accumulated interest paid
    }

    // --- Events ---

    /// @notice Emitted when a new loan is successfully created after collateral is locked.
    /// @param loanId The unique ID of the newly created loan.
    /// @param borrower The address of the borrower.
    /// @param collateralToken The token used for collateral.
    /// @param principalAmount The principal amount of the loan.
    /// @param startTime The timestamp when the loan officially started.
    event LoanCreated(uint256 indexed loanId, address indexed borrower, address indexed collateralToken, uint256 principalAmount, uint256 startTime);

    /// @notice Emitted when the status of a loan changes.
    /// @param loanId The ID of the loan whose status was updated.
    /// @param newStatus The new status of the loan.
    event LoanStatusUpdated(uint256 indexed loanId, LoanStatus newStatus);

    /// @notice Emitted after a payment has been successfully processed and recorded.
    /// @param loanId The ID of the loan the payment was for.
    /// @param principalPaid The portion of the payment allocated to principal.
    /// @param interestPaid The portion of the payment allocated to interest.
    /// @param paymentsMade The new total count of payments made for this loan.
    event LoanPaymentProcessed(uint256 indexed loanId, uint256 principalPaid, uint256 interestPaid, uint256 paymentsMade);

    /// @notice Emitted when the next payment due date for a loan is updated.
    /// @param loanId The ID of the loan.
    /// @param nextDueDate The new due date timestamp.
    event LoanDueDateUpdated(uint256 indexed loanId, uint256 nextDueDate);

    /// @notice Emitted when addresses of dependency contracts are set or updated.
    event AddressesSet(address collateralManager, address paymentHandler, address creditScorer, address reputationNFT);

    // --- State Modifying Functions ---

    /// @notice Called by CollateralManager to confirm collateral lock and trigger loan creation.
    /// @param user The address of the borrower.
    /// @param token The address of the collateral token.
    /// @param collateralAmount The amount of collateral locked.
    function notifyCollateralLockedAndCreateLoan(address user, address token, uint256 collateralAmount) external;

    /// @notice Called by PaymentHandler to record payment details against a loan.
    /// @param loanId The ID of the loan receiving payment.
    /// @param principalPaid The amount of principal paid in this transaction.
    /// @param interestPaid The amount of interest paid in this transaction.
    function processPayment(uint256 loanId, uint256 principalPaid, uint256 interestPaid) external;

    /// @notice Called by the borrower to request termination before the loan term ends.
    /// @dev Will incur an early withdrawal fee deducted from collateral.
    /// @param loanId The ID of the loan to terminate.
    function requestEarlyTermination(uint256 loanId) external;

    /// @notice Marks a loan as defaulted if payment is overdue beyond the grace period.
    /// @dev Can be called by anyone, but typically by a keeper or authorized address.
    /// @param loanId The ID of the loan to check and potentially mark as defaulted.
    function markLoanAsDefaulted(uint256 loanId) external;

    /// @notice Sets the addresses of required contract dependencies. Called by admin.
    /// @param _collateralManager Address of the CollateralManager contract.
    /// @param _paymentHandler Address of the PaymentHandler contract.
    /// @param _creditScorer Address of the CreditScorer contract.
    /// @param _reputationNFT Address of the ReputationNFT contract.
    function setAddresses(address _collateralManager, address _paymentHandler, address _creditScorer, address _reputationNFT) external;


    // --- View Functions ---

    /// @notice Retrieves the full details of a specific loan.
    /// @param loanId The ID of the loan to query.
    /// @return loan Details of the loan.
    function getLoanDetails(uint256 loanId) external view returns (Loan memory loan);

    /// @notice Gets the configured early withdrawal fee in basis points.
    /// @return Fee in basis points (e.g., 500 = 5%).
    function getEarlyWithdrawalFeeBps() external view returns (uint256);

    /// @notice Retrieves the collateral manager contract address.
    /// @return Address of the ICollateralManager.
    function getCollateralManager() external view returns (ICollateralManager);

    /// @notice Retrieves the payment handler contract address.
    /// @return Address of the IPaymentHandler.
    function getPaymentHandler() external view returns (IPaymentHandler);

    /// @notice Retrieves the credit scorer contract address.
    /// @return Address of the ICreditScorer.
    function getCreditScorer() external view returns (ICreditScorer);

    /// @notice Retrieves the reputation NFT contract address.
    /// @return Address of the IReputationNFT.
    function getReputationNFT() external view returns (IReputationNFT);
}