// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract CredVerify is Ownable {
    IERC20 public stablecoin; // Stablecoin for collateral and payments 
    uint256 public constant LOAN_DURATION = 12; // 12 months
    uint256 public constant APR = 8; // 8% annual interest rate
    uint256 public constant SCORE_BASE = 300; // Starting credit score
    uint256 public constant SCORE_MAX = 850; // Maximum credit score



    struct Loan {
        uint256 amount; // Loan amount (equals collateral)
        uint256 startTime; // Loan start timestamp
        uint256 paymentsMade; // Number of payments completed
        uint256 totalPaid; // Total amount paid (principal + interest)
        bool active; // Loan status
    }



    mapping(address => uint256) public deposits; // User collateral deposits
    mapping(address => Loan) public loans; // User loan details
    mapping(address => uint256) public creditScores; // User credit scores


//EVENTS
    event CollateralDeposited(address indexed user, uint256 amount);
    event LoanCreated(address indexed user, uint256 amount, uint256 monthlyPayment);
    event PaymentMade(address indexed user, uint256 amount, uint256 paymentsRemaining);
    event LoanCompleted(address indexed user, uint256 finalScore);

//CONSTRUCTOR 
  constructor(address _stablecoin) Ownable(msg.sender) {
        stablecoin = IERC20(_stablecoin);
    }

    /// @notice Deposits collateral to start a credit builder loan
    /// @param amount Amount of stablecoins to deposit
    
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(loans[msg.sender].active == false, "Existing loan active");
        stablecoin.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }


}