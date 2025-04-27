// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/ICreditScorer.sol";
import "./interfaces/ILoanProcessor.sol"; // For Loan struct
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title CreditScorer Contract
/// @notice Calculates and stores blockchain-based credit scores based on user loan activity.
/// @dev Receives updates from LoanProcessor and PaymentHandler to adjust scores.
contract CreditScorer is ICreditScorer, Ownable {

    // --- State Variables ---
    /// @notice Mapping from user address to their detailed credit score data.
    mapping(address => ScoreData) public scoreData;

    /// @notice Address of the PaymentHandler contract, authorized to send payment data.
    address public paymentHandlerAddress;
    /// @notice Address of the LoanProcessor contract, authorized to send loan status data.
    address public loanProcessorAddress;

    // --- Constants ---
    /// @dev Minimum possible credit score.
    uint256 private constant MIN_SCORE = 300;
    /// @dev Maximum possible credit score.
    uint256 private constant MAX_SCORE = 850;
    /// @dev Base score assigned when a user first interacts (e.g., takes a loan).
    uint256 private constant BASE_SCORE = 350; // Starting lower, build up
    /// @dev Max points achievable from the payment history component (approx 60% of range).
    uint256 private constant MAX_PAYMENT_HISTORY_POINTS = 300; // (850-350)*0.6 = 300
    /// @dev Max points achievable from loan completion factors (Duration/Amount/Consistency - approx 30% of range).
    uint256 private constant MAX_COMPLETION_POINTS = 150; // (850-350)*0.3 = 150
    /// @dev Points awarded per on-time payment.
    uint256 private constant POINTS_PER_ON_TIME_PAYMENT = 5;
    /// @dev Points deducted per late payment.
    uint256 private constant POINTS_PER_LATE_PAYMENT = 15;
    /// @dev Points deducted per loan default.
    uint256 private constant POINTS_PER_DEFAULT = 75;
    /// @dev Points deducted per early loan termination.
    uint256 private constant POINTS_PER_EARLY_TERMINATION = 10;
    /// @dev Points added per completed loan (base amount).
    uint256 private constant BASE_POINTS_PER_COMPLETED_LOAN = 10;
    /// @dev Additional points per year of loan duration upon completion.
    uint256 private constant POINTS_PER_YEAR_DURATION = 5;
    /// @dev Additional points per 1000 units of principal amount upon completion (scaled).
    uint256 private constant POINTS_PER_1K_PRINCIPAL = 1;
    /// @dev Seconds in a year for duration calculation.
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    // --- Modifiers ---
    /// @dev Restricts function calls to authorized contracts (LoanProcessor or PaymentHandler).
    modifier onlyAuthorized() {
        require(
            msg.sender == paymentHandlerAddress || msg.sender == loanProcessorAddress,
            "CS: Caller not authorized"
        );
        _;
    }

    // --- Constructor ---
    /// @notice Contract constructor.
    /// @param _initialOwner The address designated as the initial owner.
    constructor(address _initialOwner) Ownable(_initialOwner) {}

    // --- External Functions: Admin ---
    /// @notice Sets the addresses of authorized contracts that can update scores.
    /// @dev Can only be called by the contract owner.
    /// @param _loanProcessor Address of the LoanProcessor contract.
    /// @param _paymentHandler Address of the PaymentHandler contract.
    function setAddresses(address _loanProcessor, address _paymentHandler) external override onlyOwner {
        require(
            _loanProcessor != address(0) && _paymentHandler != address(0),
            "CS: Invalid address"
        );
        loanProcessorAddress = _loanProcessor;
        paymentHandlerAddress = _paymentHandler;
        // Emit event AddressesSet(address loanProcessor, address paymentHandler);
    }

    // --- External Functions: Score Updates (Called by authorized contracts) ---
    /// @notice Records a payment event and updates the borrower's score.
    /// @dev Called by PaymentHandler.
    /// @param loanId The ID of the loan (unused in current scoring, but available).
    /// @param borrower The address of the borrower whose score is updated.
    /// @param paymentTime Timestamp of the payment (unused in current scoring).
    /// @param amountPaid Amount paid (unused in current scoring).
    /// @param onTime Whether the payment was made on or before the due date.
    function recordPayment(uint256 loanId, address borrower, uint256 paymentTime, uint256 amountPaid, bool onTime) external override onlyAuthorized {
        ScoreData storage userScore = _getOrInitializeScoreData(borrower);
        userScore.lastUpdated = block.timestamp;
        // loanId, paymentTime, amountPaid are available if needed for more complex scoring
        if (onTime) {
            userScore.onTimePayments++;
        } else {
            userScore.latePayments++;
        }
        // OPTIMIZATION NOTE: Calculating score on every payment can be gas-intensive.
        // Consider updating only counters here and having a separate function for full score recalc.
        _updateScore(borrower, userScore);
    }

    /// @notice Records a successful loan completion and updates the borrower's score.
    /// @dev Called by LoanProcessor. Incorporates duration and amount factors.
    /// @param loanId The ID of the completed loan (unused in current scoring).
    /// @param borrower The address of the borrower.
    /// @param loan The details of the completed loan.
    function recordLoanCompletion(uint256 loanId, address borrower, ILoanProcessor.Loan memory loan) external override onlyAuthorized {
        ScoreData storage userScore = _getOrInitializeScoreData(borrower);
        userScore.lastUpdated = block.timestamp;
        userScore.loansCompleted++;

        // Duration bonus calculation without using separate years variable
        uint256 completionBonus = BASE_POINTS_PER_COMPLETED_LOAN;
        completionBonus += Math.min((loan.duration / SECONDS_PER_YEAR) * POINTS_PER_YEAR_DURATION, 50);

        // Amount bonus (scaled, capped)
        uint256 principalThousands = loan.principalAmount / 1000; // Assumes standard decimals for token
        completionBonus += Math.min(principalThousands * POINTS_PER_1K_PRINCIPAL, 50); // Max 50 points from amount

        // Add completion bonus to score calculation factors
        userScore.completionScoreContribution += uint64(completionBonus);

        _updateScore(borrower, userScore);
    }

    /// @notice Records a loan default and updates the borrower's score.
    /// @dev Called by LoanProcessor.
    /// @param loanId The ID of the defaulted loan (unused in current scoring).
    /// @param borrower The address of the borrower.
    /// @param loan The details of the defaulted loan (unused in current scoring).
    function recordLoanDefault(uint256 loanId, address borrower, ILoanProcessor.Loan memory loan) external override onlyAuthorized {
        ScoreData storage userScore = _getOrInitializeScoreData(borrower);
        userScore.lastUpdated = block.timestamp;
        userScore.loansDefaulted++;
        _updateScore(borrower, userScore);
    }

    /// @notice Records an early loan termination and updates the borrower's score.
    /// @dev Called by LoanProcessor. Applies a small penalty.
    /// @param loanId The ID of the terminated loan (unused in current scoring).
    /// @param borrower The address of the borrower.
    /// @param loan The details of the terminated loan (unused in current scoring).
    function recordLoanTermination(uint256 loanId, address borrower, ILoanProcessor.Loan memory loan) external override onlyAuthorized {
        ScoreData storage userScore = _getOrInitializeScoreData(borrower);
        userScore.lastUpdated = block.timestamp;
        userScore.loansTerminatedEarly++; // Add a counter for this
        _updateScore(borrower, userScore);
    }

    // --- Internal Functions ---
    /// @dev Retrieves score data for a user, initializing it if it doesn't exist.
    /// @param user The address of the user.
    /// @return userScore Storage reference to the user's score data.
    function _getOrInitializeScoreData(address user) internal returns (ScoreData storage userScore) {
        userScore = scoreData[user];
        // Initialize if first interaction
        if (userScore.lastUpdated == 0) {
            userScore.score = BASE_SCORE;
            userScore.lastUpdated = block.timestamp; // Set initial timestamp
            emit ScoreUpdated(user, userScore.score); // Emit initial score
        }
    }

    /// @dev Calculates and updates the credit score based on stored data.
    /// @param user The address of the user.
    /// @param userScore Storage reference to the user's score data.
    function _updateScore(address user, ScoreData storage userScore) internal {
        // Start with base score for calculation (don't modify stored score directly until end)
        int256 calculatedScore = int256(BASE_SCORE); // Use signed int for easier +/- adjustments

        // 1. Payment History Component (Target: ~60% weight -> up to MAX_PAYMENT_HISTORY_POINTS)
        int256 paymentPoints = 0;
        uint256 totalPayments = userScore.onTimePayments + userScore.latePayments;
        if (totalPayments > 0) {
            // Points for on-time payments
            paymentPoints += int256(userScore.onTimePayments * POINTS_PER_ON_TIME_PAYMENT);
            // Penalty for late payments
            paymentPoints -= int256(userScore.latePayments * POINTS_PER_LATE_PAYMENT);
        }
        // Apply payment history points, capped
        if (paymentPoints < int256(0)) {
            calculatedScore += paymentPoints > -int256(MAX_PAYMENT_HISTORY_POINTS) ? paymentPoints : -int256(MAX_PAYMENT_HISTORY_POINTS);
        } else {
            calculatedScore += paymentPoints < int256(MAX_PAYMENT_HISTORY_POINTS) ? paymentPoints : int256(MAX_PAYMENT_HISTORY_POINTS);
        }

        // 2. Loan Completion Component (Duration/Amount/Consistency - Target: ~30% weight -> up to MAX_COMPLETION_POINTS)
        // Use the accumulated completionScoreContribution, capped
        calculatedScore += int256(Math.min(userScore.completionScoreContribution, MAX_COMPLETION_POINTS));

        // 3. Penalties (Defaults, Early Terminations)
        calculatedScore -= int256(userScore.loansDefaulted * POINTS_PER_DEFAULT);
        calculatedScore -= int256(userScore.loansTerminatedEarly * POINTS_PER_EARLY_TERMINATION);

        // 4. Clamp final score to MIN_SCORE and MAX_SCORE
        uint finalScore;
        if (calculatedScore < int256(MIN_SCORE)) {
            finalScore = MIN_SCORE;
        } else if (calculatedScore > int256(MAX_SCORE)) {
            finalScore = MAX_SCORE;
        } else {
            finalScore = uint(calculatedScore);
        }

        // Update stored score only if it changed
        if (userScore.score != finalScore) {
            userScore.score = finalScore;
            emit ScoreUpdated(user, finalScore);
        }
        // Always update lastUpdated timestamp
        userScore.lastUpdated = block.timestamp;
    }

    // --- View Functions ---
    /// @notice Retrieves the detailed credit score data for a given user.
    /// @param user The address of the user to query.
    /// @return The user's ScoreData struct.
    function getScoreData(address user) external view override returns (ScoreData memory) {
        // Return default struct if user has no data yet, preventing revert on direct access
        return scoreData[user];
    }
}