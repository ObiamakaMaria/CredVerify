// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SD59x18, sd, convert} from "@prb/math/src/SD59x18.sol";

import "./ReputationNFT.sol";

/**
 * @title CredVerify
 * @dev Main contract for the credit builder loan system
 */
contract CredVerify is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Reference to ReputationNFT contract
    ReputationNFT public reputationNFT;

    // constant
    uint256 public constant LOAN_DURATION = 12; // 12 months
    uint256 public constant APR = 8; // 8% annual interest rate (in basis points)
    uint256 public constant MIN_CREDIT_SCORE = 300;
    uint256 public constant MAX_CREDIT_SCORE = 850;
    uint256 public constant INITIAL_CREDIT_SCORE = 550;
    uint256 public constant MIN_DEPOSIT_AMOUNT = 50e18; // $50 minimum collateral/borrow amount

    // Credit score calculation weights
    uint256 public constant PAYMENT_HISTORY_WEIGHT = 60;
    uint256 public constant LOAN_DURATION_WEIGHT = 15;
    uint256 public constant PAYMENT_CONSISTENCY_WEIGHT = 15;
    uint256 public constant LOAN_AMOUNT_WEIGHT = 10;

    // Approved stablecoins
    mapping(address => bool) public approvedStablecoins;
    address[] public approvedStablecoinsList;

    // Loan struct to store all loan details
    struct Loan {
        address borrower;
        address stablecoin;
        uint256 loanAmount;
        uint256 collateralAmount;
        uint256 monthlyPaymentAmount;
        uint256 startDate;
        uint256 nextPaymentDue;
        uint256 totalPaid;
        uint256 remainingPayments;
        uint256 nftId;
        bool active;
        bool completed;
        uint256 paymentCount;
    }

    // Track all active loans by user address
    mapping(address => Loan) public loans;

    // Track payment history using mappings
    mapping(address => mapping(uint256 => uint256)) public paymentDates; // borrower => payment index => timestamp
    mapping(address => mapping(uint256 => uint256)) public paymentAmounts; // borrower => payment index => amount
    mapping(address => mapping(uint256 => uint256)) public daysLate; // borrower => payment index => days late

    // Track users with active loans
    address[] public activeCreditScoreBuilders;

    // Events
    event StablecoinStatusChanged(address indexed stablecoin, bool approved);
    event LoanCreated(
        address indexed borrower,
        address indexed stablecoin,
        uint256 nftId,
        uint256 loanAmount
    );
    event DepositCollateral(
        address indexed borrower,
        address indexed recipient,
        address indexed stablecoin,
        uint256 depositAmount
    );
    event PaymentMade(
        address indexed borrower, 
        address indexed payer, 
        uint256 amount, 
        uint256 timestamp
    );
    event LoanEnded(
        address indexed borrower, 
        address indexed payer, 
        uint256 loanAmount, 
        uint256 timestamp
    );

    // Custom errors
    error UnactiveLoan();
    error LoanAlreadyCompleted();
    error Unauthorized();
    error InsuffisantBalance(uint256 balance, uint256 amount);
    error AmountNotAllowed(uint256 balance, uint256 amount);

    /**
     * @dev Constructor to initialize the CredVerify contract and deploy reputationNFT
     */
    constructor() Ownable(msg.sender) {
        reputationNFT = new ReputationNFT(
            address(this),
            "Credit Score History",
            "CSH"
        );
    }

    /**
     * @dev Approves or disapproves a stablecoin for use as collateral
     * @param _stablecoin The address of the stablecoin contract
     * @param _status Whether the stablecoin is approved (true) or not (false)
     */
    function setStablecoinApproval(
        address _stablecoin,
        bool _status
    ) external onlyOwner {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        if (approvedStablecoins[_stablecoin] != _status) {
            approvedStablecoins[_stablecoin] = _status;
            if (_status) {
                approvedStablecoinsList.push(_stablecoin);
            } else {
                // Remove from list
                for (uint256 i = 0; i < approvedStablecoinsList.length; i++) {
                    if (approvedStablecoinsList[i] == _stablecoin) {
                        approvedStablecoinsList[i] = approvedStablecoinsList[
                            approvedStablecoinsList.length - 1
                        ];
                        approvedStablecoinsList.pop();
                        break;
                    }
                }
            }
            emit StablecoinStatusChanged(_stablecoin, _status);
        }
    }

    /**
     * @dev Checks if a stablecoin is approved for use as collateral
     * @param _stablecoin The address of the stablecoin contract
     * @return Whether the stablecoin is approved
     */
    function isStablecoinApproved(
        address _stablecoin
    ) public view returns (bool) {
        return approvedStablecoins[_stablecoin];
    }

    /**
     * @dev Returns the list of approved stablecoins
     * @return An array of addresses of approved stablecoins
     */
    function getApprovedStablecoins() public view returns (address[] memory) {
        return approvedStablecoinsList;
    }

    /**
     * @dev Creates a new credit builder loan by depositing collateral, minting a credit NFT and transferring the loan amount to the borrower
     * @param _stablecoin The address of the stablecoin to use as collateral
     * @param _amount The amount of collateral to deposit
     * @param _tokenURI The URI of the token metadata
     */
    function createCreditBuilderLoan(
        address _stablecoin,
        uint256 _amount,
        string memory _tokenURI
    ) external nonReentrant {
        require(approvedStablecoins[_stablecoin], "Stablecoin not approved");
        require(_amount >= MIN_DEPOSIT_AMOUNT, "Amount must be >= $50");

        Loan memory loan = loans[msg.sender];

        require(!loan.active, "Active loan exists");

        require(
            IERC20(_stablecoin).balanceOf(msg.sender) >= _amount,
            "Insufficient balance"
        );

        require(
            IERC20(_stablecoin).allowance(msg.sender, address(this)) >= _amount,
            "Amount is not allowed"
        );

        //Deposit collateral
        IERC20(_stablecoin).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        loan.stablecoin = _stablecoin;
        loan.collateralAmount = _amount;

        //Transfer loan amount to borrower
        require(
            IERC20(_stablecoin).balanceOf(address(this)) >= _amount,
            "Insufficient balance"
        );
        IERC20(_stablecoin).safeTransfer(msg.sender, _amount);

        uint256 nftId = reputationNFT.mintCreditNFT(
            msg.sender,
            INITIAL_CREDIT_SCORE,
            _amount,
            APR * 100, // Convert to basis points
            LOAN_DURATION,
            _tokenURI
        );

        loan.borrower = msg.sender;
        loan.active = true;
        loan.nftId = nftId;
        loan.loanAmount = loan.collateralAmount;
        loan.monthlyPaymentAmount = calculateMonthlyPayment(
            loan.loanAmount,
            APR,
            LOAN_DURATION
        );
        loan.startDate = block.timestamp;
        loan.nextPaymentDue = block.timestamp + 30 days;
        loan.totalPaid = 0;
        loan.remainingPayments = LOAN_DURATION;
        loan.paymentCount = 0;
        loan.completed = false;

        // Save the loan to storage
        loans[msg.sender] = loan;

        activeCreditScoreBuilders.push(msg.sender);

        emit DepositCollateral(msg.sender, address(this), _stablecoin, _amount);
        emit LoanCreated(msg.sender, _stablecoin, nftId, _amount);
    }

    // Helper functions
    /**
     * @dev Calculates the monthly payment amount for a loan
     * @param principal The principal amount of the loan
     * @param apr The annual interest rate in basis points
     * @param termInMonths The term of the loan in months
     * @return The monthly payment amount
     */
    function calculateMonthlyPayment(
        uint256 principal,
        uint256 apr,
        uint256 termInMonths
    ) internal pure returns (uint256) {
        SD59x18 monthlyRate = sd(int256(apr)).div(sd(12 * 100 * 100));
        SD59x18 principalFixed = sd(int256(principal));
        SD59x18 onePlusR = sd(1e18).add(monthlyRate);
        SD59x18 onePlusRPowN = onePlusR.powu(termInMonths);
        SD59x18 numerator = monthlyRate.mul(onePlusRPowN);
        SD59x18 denominator = onePlusRPowN.sub(sd(1e18));
        SD59x18 paymentFixed = principalFixed.mul(numerator.div(denominator));
        int256 payment = convert(paymentFixed);
        require(payment >= 0, "Payment amount cannot be negative");
        return uint256(payment);
    }

    /**
     * @dev Allows the borrower to make a payment towards their loan
     * @param _borrower The address of the borrower
     */
    function makePayment(address _borrower) external {
        if(loans[_borrower].active == false) revert UnactiveLoan();
        if(loans[_borrower].completed == true) revert LoanAlreadyCompleted();

        IERC20 stablecoin = IERC20(loans[_borrower].stablecoin);

        if(stablecoin.balanceOf(loans[_borrower].borrower) < loans[_borrower].monthlyPaymentAmount) revert InsuffisantBalance(stablecoin.balanceOf(loans[_borrower].borrower), loans[_borrower].monthlyPaymentAmount);

        if(stablecoin.allowance(loans[_borrower].borrower, address(this)) < loans[_borrower].monthlyPaymentAmount) revert AmountNotAllowed(stablecoin.allowance(loans[_borrower].borrower, address(this)), loans[_borrower].monthlyPaymentAmount);

        stablecoin.safeTransferFrom(loans[_borrower].borrower, address(this), loans[_borrower].monthlyPaymentAmount);

        loans[_borrower].totalPaid += loans[_borrower].monthlyPaymentAmount;
        loans[_borrower].paymentCount += 1;
        loans[_borrower].remainingPayments -= 1;

        loans[_borrower].nextPaymentDue = loans[_borrower].nextPaymentDue + 30 days;

        if (loans[_borrower].paymentCount == 12) {
            loans[_borrower].completed = true;
            loans[_borrower].active = false;

            if((stablecoin.balanceOf(address(this)) * 1e18) < loans[_borrower].loanAmount) revert InsuffisantBalance((stablecoin.balanceOf(address(this)) * 1e18), loans[_borrower].loanAmount);

            stablecoin.safeTransfer(loans[_borrower].borrower, (loans[_borrower].collateralAmount / 1e18));

            emit LoanEnded(_borrower, address(this), loans[_borrower].totalPaid, block.timestamp);
        }

        emit PaymentMade(_borrower, address(this), loans[_borrower].monthlyPaymentAmount, block.timestamp);
    }
}