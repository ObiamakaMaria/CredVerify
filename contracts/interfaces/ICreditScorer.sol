// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ILoanProcessor.sol"; // Import for Loan struct if needed

/// @notice Interface for the CreditScorer contract.
interface ICreditScorer {
    /// @notice Structure holding detailed credit score components for a user.
    struct ScoreData {
        uint256 score;                   // The calculated credit score (e.g., 300-850)
        uint64 onTimePayments;         // Count of payments made on or before the due date
        uint64 latePayments;           // Count of payments made after the due date
        uint64 loansCompleted;         // Count of loans successfully paid in full
        uint64 loansDefaulted;         // Count of loans marked as defaulted
        uint64 loansTerminatedEarly;   // Count of loans terminated early by the borrower
        uint64 completionScoreContribution; // Accumulated points from completing loans (duration/amount bonuses)
        uint256 lastUpdated;             // Timestamp of the last score update event
    }

    /// @notice Emitted when a user's credit score is updated.
    /// @param user The address of the user whose score was updated.
    /// @param newScore The new calculated credit score.
    event ScoreUpdated(address indexed user, uint256 newScore);

    // --- State Modifying Functions (Callable by authorized contracts) ---

    /// @notice Records a payment event.
    /// @param loanId The ID of the loan associated with the payment.
    /// @param borrower The address of the borrower.
    /// @param paymentTime Timestamp of the payment transaction.
    /// @param amountPaid The amount paid in the transaction.
    /// @param onTime True if the payment was on or before the due date, false otherwise.
    function recordPayment(uint256 loanId, address borrower, uint256 paymentTime, uint256 amountPaid, bool onTime) external; // Called by PaymentHandler

    /// @notice Records the successful completion of a loan.
    /// @param loanId The ID of the completed loan.
    /// @param borrower The address of the borrower.
    /// @param loan The details of the completed loan.
    function recordLoanCompletion(uint256 loanId, address borrower, ILoanProcessor.Loan memory loan) external; // Called by LoanProcessor

    /// @notice Records a loan being marked as defaulted.
    /// @param loanId The ID of the defaulted loan.
    /// @param borrower The address of the borrower.
    /// @param loan The details of the defaulted loan.
    function recordLoanDefault(uint256 loanId, address borrower, ILoanProcessor.Loan memory loan) external; // Called by LoanProcessor/PaymentHandler

    /// @notice Records a loan being terminated early by the borrower.
    /// @param loanId The ID of the terminated loan.
    /// @param borrower The address of the borrower.
    /// @param loan The details of the terminated loan.
    function recordLoanTermination(uint256 loanId, address borrower, ILoanProcessor.Loan memory loan) external; // Called by LoanProcessor

    // --- Admin Functions ---

    /// @notice Sets the addresses of contracts authorized to update score data.
    /// @param _loanProcessor Address of the LoanProcessor contract.
    /// @param _paymentHandler Address of the PaymentHandler contract.
    function setAddresses(address _loanProcessor, address _paymentHandler) external; // Combined setter

    // --- View Functions ---

    /// @notice Retrieves the detailed score data for a specific user.
    /// @param user The address of the user.
    /// @return scoreData_ The ScoreData struct for the user.
    function getScoreData(address user) external view returns (ScoreData memory scoreData_);
}