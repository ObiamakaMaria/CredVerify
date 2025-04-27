// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IPaymentHandler.sol";
import "./interfaces/ILoanProcessor.sol";
import "./interfaces/ICreditScorer.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol"; // For SafeMath operations if needed below 0.8.0

/// @title PaymentHandler Contract
/// @notice Handles receiving loan payments from borrowers, calculating interest/principal split, and interacting with LoanProcessor and CreditScorer.
/// @dev Assumes a single ERC20 token for payments, matching the collateral token.
contract PaymentHandler is IPaymentHandler, Ownable {
    using SafeERC20 for IERC20;

    // --- State Variables ---
    /// @notice Address of the LoanProcessor contract.
    ILoanProcessor public loanProcessor;
    /// @notice Address of the CreditScorer contract.
    ICreditScorer public creditScorer;
    /// @notice The ERC20 token accepted for payments (e.g., a stablecoin).
    IERC20 private _paymentToken;
    /// @notice Address where collected principal and interest payments are sent.
    address public treasuryAddress;

    // --- Constants ---
    /// @dev Basis points denominator (10000 = 100%).
    uint256 private constant BPS_DENOMINATOR = 10000;
    /// @dev Duration of one payment period in seconds (e.g., 30 days).
    uint256 private constant PAYMENT_PERIOD_SECONDS = 30 days; // Must match LoanProcessor

    // --- Modifiers ---
    /// @dev Restricts function calls to the registered LoanProcessor contract.
    modifier onlyLoanProcessor() {
        require(msg.sender == address(loanProcessor), "PH: Caller is not LoanProcessor");
        _;
    }

    /// @dev Restricts function calls to the registered CreditScorer contract.
    modifier onlyCreditScorer() { // Although unused currently, keep for potential future callbacks
        require(msg.sender == address(creditScorer), "PH: Caller is not CreditScorer");
        _;
    }

    // --- Constructor ---
    /// @notice Contract constructor.
    /// @param _initialOwner The address designated as the initial owner.
    constructor(address _initialOwner) Ownable(_initialOwner) {}

    // --- External Functions: Admin ---
    /// @notice Sets the addresses of required contract dependencies and the payment token.
    /// @dev Can only be called by the contract owner.
    /// @param _loanProcessor Address of the LoanProcessor contract.
    /// @param _creditScorer Address of the CreditScorer contract.
    /// @param paymentTokenAddress Address of the ERC20 token to be used for payments.
    function setAddresses(address _loanProcessor, address _creditScorer, address paymentTokenAddress) external override onlyOwner {
        require(_loanProcessor != address(0) && _creditScorer != address(0) && paymentTokenAddress != address(0), "PH: Invalid address");
        loanProcessor = ILoanProcessor(_loanProcessor);
        creditScorer = ICreditScorer(_creditScorer);
        _paymentToken = IERC20(paymentTokenAddress);
        emit AddressesSet(_loanProcessor, _creditScorer, paymentTokenAddress);
    }

    /// @notice Sets the address where collected principal and interest payments will be sent.
    /// @dev Can only be called by the contract owner.
    /// @param _treasuryAddress The address to designate as the treasury.
    function setTreasuryAddress(address _treasuryAddress) external override onlyOwner {
        require(_treasuryAddress != address(0), "PH: Invalid treasury address");
        treasuryAddress = _treasuryAddress;
        emit TreasuryAddressSet(_treasuryAddress);
    }

    // --- External Functions: Payments ---
    /// @notice Allows a borrower (or potentially anyone) to make a payment towards a loan.
    /// @dev Calculates interest due, splits payment into principal/interest, transfers tokens, and notifies other contracts.
    /// @param loanId The ID of the loan to make a payment for.
    /// @param amount The amount of paymentToken being sent.
    function makePayment(uint256 loanId, uint256 amount) external override {
        ILoanProcessor.Loan memory loan = loanProcessor.getLoanDetails(loanId);

        // --- Checks ---
        require(loan.borrower != address(0), "PH: Loan does not exist");
        require(loan.status == ILoanProcessor.LoanStatus.Active, "PH: Loan not active");
        // require(msg.sender == loan.borrower, "PH: Only borrower can pay"); // Allowing anyone to pay for now
        require(amount > 0, "PH: Amount must be positive");
        require(treasuryAddress != address(0), "PH: Treasury address not set"); // Ensure treasury is set

        // --- Calculations ---
        // Calculate interest accrued since the last due date (or start time if first payment)
        // Note: This simplified approach assumes payment happens close to the due date.
        // A more robust calculation would use block.timestamp and time since last payment/due date.
        (uint256 interestDueForPeriod) = _calculateInterestForPeriod(loan);

        require(amount >= interestDueForPeriod, "PH: Payment less than interest due"); // Must cover current interest

        // Determine actual principal and interest components of the payment
        uint256 interestComponent = Math.min(amount, interestDueForPeriod);
        uint256 principalComponent = amount - interestComponent;

        // Clamp principal if it exceeds the remaining balance
        uint256 remainingPrincipal = loan.principalAmount - loan.totalPaidPrincipal;
        if (principalComponent > remainingPrincipal) {
            principalComponent = remainingPrincipal;
            // Adjust total amount transferred if user sent excess
            amount = interestComponent + principalComponent;
        }

        // Determine if payment is on time (before or on the due date)
        bool isOnTime = block.timestamp <= loan.nextDueDate;

        // --- Effects & Interactions ---
        // 1. Pull payment from user to this contract
        _paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        // 2. Forward payment components to the configured treasury address
        // Transfer interest component if it's greater than zero
        if (interestComponent > 0) {
            _paymentToken.safeTransfer(treasuryAddress, interestComponent);
        }
        // Transfer principal component if it's greater than zero
        if (principalComponent > 0) {
            _paymentToken.safeTransfer(treasuryAddress, principalComponent);
        }

        // 3. Notify LoanProcessor to update loan state
        loanProcessor.processPayment(loanId, principalComponent, interestComponent);

        // 4. Notify CreditScorer about the payment event
        creditScorer.recordPayment(loanId, loan.borrower, block.timestamp, amount, isOnTime);

        emit PaymentMade(loanId, msg.sender, amount, principalComponent, interestComponent, isOnTime); // Added isOnTime to event
    }

    // --- View Functions ---
    /// @notice Calculates the estimated interest due for the current payment period.
    /// @dev Uses a simplified calculation based on remaining principal and fixed period duration.
    /// @param loanId The ID of the loan.
    /// @return interestDue Estimated interest for the period.
    /// @return nextDueDate Timestamp for the next expected payment.
    function getExpectedPaymentInfo(uint256 loanId) external view returns (uint256 interestDue, uint256 nextDueDate) {
        ILoanProcessor.Loan memory loan = loanProcessor.getLoanDetails(loanId);

        if (loan.status != ILoanProcessor.LoanStatus.Active) {
            return (0, 0); // No payment due if loan not active
        }

        interestDue = _calculateInterestForPeriod(loan);
        nextDueDate = loan.nextDueDate;

        return (interestDue, nextDueDate);
    }

    /// @notice Implements the IPaymentHandler interface getExpectedPayment function
    /// @param loanId The ID of the loan.
    /// @return totalDue The total payment due.
    /// @return principalDue The principal portion of the payment due.
    /// @return interestDue The interest portion of the payment due.
    function getExpectedPayment(uint256 loanId) external view returns (uint256 totalDue, uint256 principalDue, uint256 interestDue) {
        ILoanProcessor.Loan memory loan = loanProcessor.getLoanDetails(loanId);
        
        if (loan.status != ILoanProcessor.LoanStatus.Active) {
            return (0, 0, 0); // No payment due if loan not active
        }

        if (loan.annualInterestRateBps == 0) {
            // For zero interest loans, just divide remaining principal by remaining periods
            uint256 remainingPrincipal = loan.principalAmount - loan.totalPaidPrincipal;
            uint256 remainingPayments = (loan.duration - (block.timestamp - loan.startTime)) / PAYMENT_PERIOD_SECONDS;
            if (remainingPayments == 0) remainingPayments = 1;
            
            return (remainingPrincipal / remainingPayments, remainingPrincipal / remainingPayments, 0);
        }
        
        // Calculate monthly interest using more precise formula:
        // Monthly Interest = Principal * Annual Rate / (12 * BPS_DENOMINATOR)
        interestDue = (loan.principalAmount * loan.annualInterestRateBps) / (12 * BPS_DENOMINATOR);
        
        // For principal, use equal installments based on total loan duration
        uint256 remainingPrincipal = loan.principalAmount - loan.totalPaidPrincipal;
        uint256 totalPayments = loan.duration / PAYMENT_PERIOD_SECONDS;
        principalDue = remainingPrincipal / totalPayments;
        
        totalDue = principalDue + interestDue;
        
        // Add late payment penalty if applicable
        if (block.timestamp > loan.nextDueDate) {
            uint256 lateFee = (interestDue * 10) / 100; // 10% late fee
            interestDue += lateFee;
            totalDue += lateFee;
        }
        
        return (totalDue, principalDue, interestDue);
    }
    
    /// @notice Implementation of paymentToken interface function
    function paymentToken() external view returns(address) {
        return address(_paymentToken);
    }

    // --- Internal Functions ---
    /// @dev Calculates the interest accrued for a standard payment period.
    /// @param loan The loan object.
    /// @return interestForPeriod The calculated interest for one period.
    function _calculateInterestForPeriod(ILoanProcessor.Loan memory loan) internal view returns (uint256 interestForPeriod) {
        uint256 remainingPrincipal = loan.principalAmount - loan.totalPaidPrincipal;
        if (remainingPrincipal == 0 || loan.annualInterestRateBps == 0) {
            return 0;
        }

        // Calculate monthly interest using more precise formula:
        // Monthly Interest = Principal * Annual Rate / (12 * BPS_DENOMINATOR)
        interestForPeriod = (remainingPrincipal * loan.annualInterestRateBps) / (12 * BPS_DENOMINATOR);

        // Add late payment penalty if applicable
        if (block.timestamp > loan.nextDueDate) {
            // Add 10% penalty for late payments
            interestForPeriod = (interestForPeriod * 110) / 100;
        }

        return interestForPeriod;
    }

    // --- Fallback Functions ---
    /// @dev Optional: Allow receiving ETH if needed for gas or other purposes.
    // receive() external payable {}
    /// @dev Optional: Fallback function.
    // fallback() external payable {}
}