// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './MockERC20.sol';

contract PaymentProcess {

    struct Loan {
        address borrower;
        address stablecoin;
        uint256 loanAmount;
        uint256 collateralAmount;
        uint256 monthlyPaymentAmount;
        uint256 interestRate;
        uint256 startDate;
        uint256 nextPaymentDue;
        uint256 totalPaid;
        uint256 remainingPayments;
        bool active;
        bool completed;
        uint256 paymentCount;
    }

    mapping(uint256 => Loan) public loans; 
    uint256 public nextLoanId;

    event PaymentMade(uint256 indexed loanId, address indexed payer, uint256 amount, uint256 timestamp);
    event LoanEnded(uint256 indexed loanId, address indexed payer, uint256 loanAmount, uint256 timestamp);
    event CollateralRefunded(uint256 indexed loanId, address indexed borrower, uint256 collateralAmount, uint256 timestamp);
    event LoanInitiated(uint256 indexed loanId, address indexed borrower, uint256 collateralAmount, uint256 loanAmount, uint256 monthlyPaymentAmount, uint256 timestamp);

    error UnactiveLoan();
    error LoanAlreadyCompleted();
    error Unauthorized();

    function makePayment(uint256 loanId) external {
        Loan storage loan = loans[loanId];

        if(loan.active == false) revert UnactiveLoan();
        if(loan.completed == true) revert LoanAlreadyCompleted();
        if(loan.borrower != msg.sender) revert Unauthorized();

        MockERC20 stablecoin = MockERC20(loan.stablecoin);

        stablecoin.transfer(msg.sender, loan.monthlyPaymentAmount);

        loan.totalPaid += loan.monthlyPaymentAmount;
        loan.paymentCount += 1;
        loan.remainingPayments -= 1;

        loan.nextPaymentDue = loan.nextPaymentDue + 30 days;

        if (loan.remainingPayments == 0) {
            loan.completed = true;
            loan.active = false;

            emit LoanEnded(loanId, msg.sender, loan.totalPaid, block.timestamp);

            stablecoin.transfer(loan.borrower, loan.collateralAmount);

            emit CollateralRefunded(loanId, msg.sender, loan.collateralAmount, block.timestamp);
        }

        emit PaymentMade(loanId, msg.sender, loan.monthlyPaymentAmount, block.timestamp);
    }

    function initiateLoan(
        address stablecoinAddress,
        uint256 collateralAmount,
        uint256 interestRate,
        uint256 durationMonths
    ) external {
        require(collateralAmount > 0, "Collateral must be > 0");
        require(durationMonths > 0, "Duration must be > 0");

        MockERC20 stablecoin = MockERC20(stablecoinAddress);

        uint256 loanAmount = collateralAmount; // 1:1 ratio as per PRD
        uint256 interest = (loanAmount * interestRate) / 10000; // 8% = 800 basis points
        uint256 totalRepayAmount = loanAmount + interest;
        uint256 monthlyPayment = totalRepayAmount / durationMonths;

        uint256 startTimestamp = block.timestamp;

        // Transfer collateral to contract
        stablecoin.transferFrom(msg.sender, address(this), collateralAmount);

        loans[nextLoanId] = Loan({
            borrower: msg.sender,
            stablecoin: stablecoinAddress,
            loanAmount: loanAmount,
            collateralAmount: collateralAmount,
            monthlyPaymentAmount: monthlyPayment,
            interestRate: interestRate,
            startDate: startTimestamp,
            nextPaymentDue: startTimestamp + 30 days,
            totalPaid: 0,
            remainingPayments: durationMonths,
            active: true,
            completed: false,
            paymentCount: 0
        });

        emit LoanInitiated(nextLoanId, msg.sender, collateralAmount, loanAmount, monthlyPayment, block.timestamp);

        nextLoanId++;
    }
}
