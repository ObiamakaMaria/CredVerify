// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './MockERC20.sol';
import './CredVerify.sol';

contract PaymentProcess {

    event PaymentMade(address indexed borrower, address indexed payer, uint256 amount, uint256 timestamp);
    event LoanEnded(address indexed borrower, address indexed payer, uint256 loanAmount, uint256 timestamp);

    error UnactiveLoan();
    error LoanAlreadyCompleted();
    error Unauthorized();

    function makePayment(address borrower) external {
        Loan storage loan = loans[borrower];

        if(loan.active == false) revert UnactiveLoan();
        if(loan.completed == true) revert LoanAlreadyCompleted();

        MockERC20 stablecoin = MockERC20(loan.stablecoin);

        stablecoin.approveAndTransfer(address(this), loan.monthlyPaymentAmount, loan.borrower);

        loan.totalPaid += loan.monthlyPaymentAmount;
        loan.paymentCount += 1;
        loan.remainingPayments -= 1;

        loan.nextPaymentDue = loan.nextPaymentDue + 30 days;

        if (loan.remainingPayments == 0) {
            loan.completed = true;
            loan.active = false;

            emit LoanEnded(borrower, msg.sender, loan.totalPaid, block.timestamp);
        }

        emit PaymentMade(borrower, msg.sender, loan.monthlyPaymentAmount, block.timestamp);
    }
}
