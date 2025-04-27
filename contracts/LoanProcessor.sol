// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/ILoanProcessor.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/IPaymentHandler.sol";
import "./interfaces/ICreditScorer.sol";
import "./interfaces/IReputationNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol"; // For NFT metadata URI generation

/// @title LoanProcessor Contract
/// @notice Manages the lifecycle of credit builder loans, including creation, status updates, and interaction with other system contracts.
/// @dev Coordinates between CollateralManager, PaymentHandler, CreditScorer, and ReputationNFT.
contract LoanProcessor is ILoanProcessor, Ownable {
    using Strings for uint256;

    // --- State Variables ---

    /// @notice Address of the CollateralManager contract.
    ICollateralManager public collateralManager;
    /// @notice Address of the PaymentHandler contract.
    IPaymentHandler public paymentHandler;
    /// @notice Address of the CreditScorer contract.
    ICreditScorer public creditScorer;
    /// @notice Address of the ReputationNFT contract.
    IReputationNFT public reputationNFT;

    /// @notice Mapping from loan ID to the Loan struct containing its details.
    mapping(uint256 => Loan) public loans;
    /// @notice Counter to generate unique loan IDs.
    uint256 private nextLoanId;

    /// @notice Fee charged for early termination, in basis points (e.g., 500 = 5.00%).
    uint256 private _earlyWithdrawalFeeBps;

    // --- Constants ---

    /// @dev Default annual interest rate in basis points (800 = 8.00%). TODO: Make configurable per loan?
    uint256 private constant DEFAULT_ANNUAL_INTEREST_RATE_BPS = 800;
    /// @dev Default loan duration in seconds (~1 year). TODO: Make configurable per loan?
    uint256 private constant DEFAULT_LOAN_DURATION_SECONDS = 31536000; // ~1 year
    /// @dev Payment period duration (e.g., 30 days). Used to calculate next due date.
    uint256 private constant PAYMENT_PERIOD_SECONDS = 30 days;
    /// @dev Grace period in seconds after the due date before a loan can be marked as defaulted.
    uint256 private constant DEFAULT_GRACE_PERIOD_SECONDS = 15 days;

    // --- Modifiers ---

    /// @dev Ensures the specified loan ID exists.
    modifier loanExists(uint256 loanId) {
        require(loans[loanId].borrower != address(0), "LP: Loan does not exist");
        _;
    }

    /// @dev Restricts function calls to the registered PaymentHandler contract.
    modifier onlyPaymentHandler() {
        require(msg.sender == address(paymentHandler), "LP: Caller is not PaymentHandler");
        _;
    }

    /// @dev Restricts function calls to the registered CollateralManager contract.
    modifier onlyCollateralManager() {
        require(msg.sender == address(collateralManager), "LP: Caller is not CollateralManager");
        _;
    }

    // --- Constructor ---

    /// @notice Contract constructor.
    /// @param initialFeeBps The initial early withdrawal fee in basis points.
    constructor(uint256 initialFeeBps) Ownable(msg.sender) {
        require(initialFeeBps <= 10000, "LP: Fee cannot exceed 100%"); // Prevent > 100% fee
        _earlyWithdrawalFeeBps = initialFeeBps;
        nextLoanId = 1;
    }

    // --- External Functions: Admin ---

    /// @notice Sets the addresses of required contract dependencies.
    /// @dev Can only be called by the contract owner.
    /// @param _collateralManager Address of the CollateralManager contract.
    /// @param _paymentHandler Address of the PaymentHandler contract.
    /// @param _creditScorer Address of the CreditScorer contract.
    /// @param _reputationNFT Address of the ReputationNFT contract.
    function setAddresses(
        address _collateralManager,
        address _paymentHandler,
        address _creditScorer,
        address _reputationNFT
    ) external override onlyOwner {
        require(
            _collateralManager != address(0) &&
            _paymentHandler != address(0) &&
            _creditScorer != address(0) &&
            _reputationNFT != address(0),
            "LP: Invalid address"
        );
        collateralManager = ICollateralManager(_collateralManager);
        paymentHandler = IPaymentHandler(_paymentHandler);
        creditScorer = ICreditScorer(_creditScorer);
        reputationNFT = IReputationNFT(_reputationNFT);
        emit AddressesSet(_collateralManager, _paymentHandler, _creditScorer, _reputationNFT);
    }

    /// @notice Gets the configured early withdrawal fee in basis points.
    /// @return Fee in basis points (e.g., 500 = 5%).
    function getEarlyWithdrawalFeeBps() external view override returns (uint256) {
        return _earlyWithdrawalFeeBps;
    }

    /// @notice Updates the early withdrawal fee.
    /// @dev Can only be called by the contract owner.
    /// @param _newFeeBps The new fee in basis points.
    function setEarlyWithdrawalFeeBps(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= 10000, "LP: Fee cannot exceed 100%");
        _earlyWithdrawalFeeBps = _newFeeBps;
        // Add event if needed: event EarlyWithdrawalFeeUpdated(uint256 newFeeBps);
    }

    // --- External Functions: Loan Lifecycle ---

    /// @notice Called by CollateralManager to confirm collateral lock and trigger loan creation.
    /// @dev Initializes the loan state, including the first payment due date.
    /// @param user The address of the borrower.
    /// @param token The address of the collateral token.
    /// @param collateralAmount The amount of collateral locked.
    function notifyCollateralLockedAndCreateLoan(address user, address token, uint256 collateralAmount)
        external
        override
        onlyCollateralManager // Restrict caller
    {
        require(user != address(0), "LP: Invalid user address");
        require(token != address(0), "LP: Invalid token address");
        require(collateralAmount > 0, "LP: Invalid collateral amount");
        // Ensure collateral token matches PaymentHandler's payment token? Or allow different?
        // Assuming they must match for simplicity based on PRD.
        require(token == paymentHandler.paymentToken(), "LP: Collateral token mismatch");

        uint256 loanId = nextLoanId++;
        uint256 startTime = block.timestamp;
        uint256 firstDueDate = startTime + PAYMENT_PERIOD_SECONDS;

        Loan memory newLoan = Loan({
            id: loanId,
            borrower: user,
            collateralToken: token,
            collateralAmount: collateralAmount,
            principalAmount: collateralAmount, // PRD: 1:1 ratio
            annualInterestRateBps: DEFAULT_ANNUAL_INTEREST_RATE_BPS,
            startTime: startTime,
            duration: DEFAULT_LOAN_DURATION_SECONDS,
            nextDueDate: firstDueDate,
            status: LoanStatus.Active,
            paymentsMade: 0,
            totalPaidPrincipal: 0,
            totalPaidInterest: 0
        });
        loans[loanId] = newLoan;

        // Notify Collateral Manager to store its collateral info associated with this Loan ID
        // collateralManager.storeCollateralInfo(loanId, user, token, collateralAmount);
        // Assuming CM tracks collateral internally upon deposit, maybe this explicit call isn't needed?
        // Depends on CM's design. Removed for now, assuming CM knows.

        emit LoanCreated(loanId, user, token, newLoan.principalAmount, startTime);
        emit LoanStatusUpdated(loanId, LoanStatus.Active);
        emit LoanDueDateUpdated(loanId, firstDueDate);
        // Optionally notify CreditScorer about loan start if needed for scoring logic
    }

    /// @notice Called by PaymentHandler after processing a payment.
    /// @dev Updates loan repayment counters and advances the next due date. Checks for loan completion.
    /// @param loanId The ID of the loan receiving payment.
    /// @param principalPaid The amount of principal paid in this transaction.
    /// @param interestPaid The amount of interest paid in this transaction.
    function processPayment(uint256 loanId, uint256 principalPaid, uint256 interestPaid)
        external override onlyPaymentHandler loanExists(loanId)
    {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "LP: Loan not active");

        loan.paymentsMade++;
        loan.totalPaidPrincipal += uint128(principalPaid);
        loan.totalPaidInterest += uint128(interestPaid);

        // Advance due date
        loan.nextDueDate += PAYMENT_PERIOD_SECONDS;
        emit LoanDueDateUpdated(loanId, loan.nextDueDate);

        emit LoanPaymentProcessed(loanId, principalPaid, interestPaid, loan.paymentsMade);

        // Check if loan is fully paid (allow for slight overpayment due to rounding)
        if (loan.totalPaidPrincipal >= loan.principalAmount) {
            _markLoanCompleted(loanId, loan);
        }
        // Note: Default check is handled by the separate `markLoanAsDefaulted` function.
    }

    /// @notice Called by the borrower to request termination before the loan term ends.
    /// @dev Marks the loan as EarlyTerminated and requests collateral withdrawal with fee.
    /// @param loanId The ID of the loan to terminate.
    function requestEarlyTermination(uint256 loanId) external override loanExists(loanId) {
        Loan storage loan = loans[loanId];
        require(msg.sender == loan.borrower, "LP: Not the borrower");
        require(loan.status == LoanStatus.Active, "LP: Loan not active");

        // Mark loan as terminated FIRST
        loan.status = LoanStatus.EarlyTerminated;
        emit LoanStatusUpdated(loanId, LoanStatus.EarlyTerminated);

        // Authorize collateral withdrawal WITH fee deduction by calling the updated CollateralManager function
        collateralManager.authorizeWithdrawalWithFee(loanId, _earlyWithdrawalFeeBps);

        // Notify CreditScorer about the termination
        creditScorer.recordLoanTermination(loanId, loan.borrower, loan); // Pass full loan struct
    }

    /// @notice Marks a loan as defaulted if payment is overdue beyond the grace period.
    /// @dev Can be called by anyone, but typically by a keeper or authorized address. Checks conditions before acting.
    /// @param loanId The ID of the loan to check and potentially mark as defaulted.
    function markLoanAsDefaulted(uint256 loanId) external override loanExists(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "LP: Loan not active or already resolved");
        require(block.timestamp > loan.nextDueDate + DEFAULT_GRACE_PERIOD_SECONDS, "LP: Grace period not passed");

        // Mark as defaulted
        loan.status = LoanStatus.Defaulted;
        emit LoanStatusUpdated(loanId, LoanStatus.Defaulted);

        // Notify CreditScorer
        creditScorer.recordLoanDefault(loanId, loan.borrower, loan);

        // Handle collateral forfeiture by calling the CollateralManager
        // Assumption: Defaulted collateral goes to the owner of this LoanProcessor contract.
        collateralManager.claimDefaultedCollateral(loanId, owner());
    }

    // --- Internal Functions ---

    /// @dev Internal function to handle actions upon successful loan completion.
    /// @param loanId The ID of the completed loan.
    /// @param loan Reference to the loan storage.
    function _markLoanCompleted(uint256 loanId, Loan storage loan) internal {
        require(loan.status == LoanStatus.Active, "LP: Internal: Loan not active"); // Pre-condition

        loan.status = LoanStatus.PaidInFull;
        emit LoanStatusUpdated(loanId, LoanStatus.PaidInFull);

        // Authorize full collateral withdrawal
        collateralManager.authorizeWithdrawal(loanId, loan.borrower, loan.collateralToken);

        // Notify CreditScorer
        creditScorer.recordLoanCompletion(loanId, loan.borrower, loan);

        // Mint Reputation NFT
        // Retrieve final score (Note: score might update slightly on completion event itself)
        // It might be better for CreditScorer to return the final score upon recordLoanCompletion call
        ICreditScorer.ScoreData memory scoreData = creditScorer.getScoreData(loan.borrower);
        // Construct metadata URI (requires off-chain service)
        string memory metadataURI = _generateMetadataURI(loanId, scoreData.score, loan);
        reputationNFT.mint(loan.borrower, loanId, scoreData.score, metadataURI);
    }

    /// @dev Internal helper to generate a placeholder metadata URI for the NFT.
    /// @param loanId The ID of the loan.
    /// @param finalScore The final credit score associated with the loan completion.
    /// @param loan Reference to the loan data (can be used for more detailed URI).
    /// @return A string representing the metadata URI.
    function _generateMetadataURI(uint256 loanId, uint256 finalScore, Loan storage loan) internal pure returns (string memory) {
        // Avoid unused variable warning
        finalScore;
        loan;
        // In a real implementation, this would involve:
        // 1. Hashing relevant loan data (borrower, completion status, score, loanId, etc.).
        // 2. Storing the full metadata JSON off-chain (e.g., IPFS, Arweave, centralized API).
        // 3. Returning a URI pointing to that off-chain metadata (e.g., "ipfs://<METADATA_HASH>" or "https://api.yourplatform.com/nft/metadata/{loanId}").
        // Placeholder example:
        return string(abi.encodePacked("https://api.example.com/nft/metadata/", loanId.toString()));
    }

    // --- View Functions ---

    /// @notice Retrieves the full details of a specific loan.
    /// @param loanId The ID of the loan to query.
    /// @return loan Details of the loan.
    function getLoanDetails(uint256 loanId) external view override returns (Loan memory) {
        return loans[loanId];
    }

    /// @notice Retrieves the collateral manager contract address.
    /// @return Address of the ICollateralManager.
    function getCollateralManager() external view override returns (ICollateralManager) {
        return collateralManager;
    }

    /// @notice Retrieves the payment handler contract address.
    /// @return Address of the IPaymentHandler.
    function getPaymentHandler() external view override returns (IPaymentHandler) {
        return paymentHandler;
    }

    /// @notice Retrieves the credit scorer contract address.
    /// @return Address of the ICreditScorer.
    function getCreditScorer() external view override returns (ICreditScorer) {
        return creditScorer;
    }

    /// @notice Retrieves the reputation NFT contract address.
    /// @return Address of the IReputationNFT.
    function getReputationNFT() external view override returns (IReputationNFT) {
        return reputationNFT;
    }
}