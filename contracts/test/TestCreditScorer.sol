// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../CreditScorer.sol";

/**
 * @title TestCreditScorer
 * @notice Test-specific version of CreditScorer that exposes internal methods for testing
 * @dev This contract is ONLY for testing and should never be deployed to production
 */
contract TestCreditScorer is CreditScorer {
    // Define constants that are used in the test methods
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BASE_POINTS_PER_COMPLETED_LOAN = 10;
    uint256 private constant POINTS_PER_YEAR_DURATION = 5;
    uint256 private constant POINTS_PER_1K_PRINCIPAL = 1;

    constructor(address initialOwner) CreditScorer(initialOwner) {}

    /**
     * @notice Directly initialize a user's score for testing
     * @param user Address of the user to initialize
     */
    function testInitializeUser(address user) external {
        ScoreData storage userScore = _getOrInitializeScoreData(user);
    }

    /**
     * @notice Directly update a user's score with specific data
     * @param user Address of the user
     * @param onTimePayments Number of on-time payments to set
     * @param latePayments Number of late payments to set
     * @param loansCompleted Number of completed loans to set
     * @param loansDefaulted Number of defaulted loans to set
     * @param loansTerminatedEarly Number of early terminated loans to set
     * @param completionScoreContribution Completion score contribution to set
     */
    function testUpdateUserData(
        address user,
        uint64 onTimePayments,
        uint64 latePayments,
        uint64 loansCompleted,
        uint64 loansDefaulted,
        uint64 loansTerminatedEarly,
        uint64 completionScoreContribution
    ) external {
        ScoreData storage userScore = _getOrInitializeScoreData(user);
        userScore.onTimePayments = onTimePayments;
        userScore.latePayments = latePayments;
        userScore.loansCompleted = loansCompleted;
        userScore.loansDefaulted = loansDefaulted;
        userScore.loansTerminatedEarly = loansTerminatedEarly;
        userScore.completionScoreContribution = completionScoreContribution;
        
        // Force a score recalculation
        _updateScore(user, userScore);
    }

    /**
     * @notice Expose the internal _updateScore method for testing
     * @param user Address of the user
     */
    function testForceUpdateScore(address user) external {
        ScoreData storage userScore = scoreData[user];
        require(userScore.lastUpdated > 0, "User not initialized");
        _updateScore(user, userScore);
    }

    /**
     * @notice Simulate adding on-time payments for a user
     * @param user Address of the user
     * @param count Number of on-time payments to add
     */
    function testAddOnTimePayments(address user, uint64 count) external {
        ScoreData storage userScore = _getOrInitializeScoreData(user);
        userScore.onTimePayments += count;
        _updateScore(user, userScore);
    }

    /**
     * @notice Simulate adding late payments for a user
     * @param user Address of the user
     * @param count Number of late payments to add
     */
    function testAddLatePayments(address user, uint64 count) external {
        ScoreData storage userScore = _getOrInitializeScoreData(user);
        userScore.latePayments += count;
        _updateScore(user, userScore);
    }

    /**
     * @notice Simulate adding loan defaults for a user
     * @param user Address of the user
     * @param count Number of defaults to add
     */
    function testAddDefaults(address user, uint64 count) external {
        ScoreData storage userScore = _getOrInitializeScoreData(user);
        userScore.loansDefaulted += count;
        _updateScore(user, userScore);
    }

    /**
     * @notice Simulate adding completed loans with duration bonus
     * @param user Address of the user
     * @param count Number of completed loans to add
     * @param durationInSeconds Duration of each loan in seconds
     * @param principalAmount Principal amount of each loan
     */
    function testAddCompletedLoans(
        address user,
        uint64 count,
        uint256 durationInSeconds,
        uint256 principalAmount
    ) external {
        ScoreData storage userScore = _getOrInitializeScoreData(user);
        userScore.loansCompleted += count;
        
        // Calculate completion bonus similar to recordLoanCompletion
        uint256 completionBonus = BASE_POINTS_PER_COMPLETED_LOAN * count;
        completionBonus += Math.min((durationInSeconds / SECONDS_PER_YEAR) * POINTS_PER_YEAR_DURATION * count, 50 * count);
        
        // Amount bonus (scaled, capped)
        uint256 principalThousands = principalAmount / 1000;
        completionBonus += Math.min(principalThousands * POINTS_PER_1K_PRINCIPAL * count, 50 * count);
        
        userScore.completionScoreContribution += uint64(completionBonus);
        _updateScore(user, userScore);
    }
} 