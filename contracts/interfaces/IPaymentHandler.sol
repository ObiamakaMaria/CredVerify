// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPaymentHandler {
    event PaymentMade(uint256 indexed loanId, address indexed payer, uint256 amountPaid, uint256 principalComponent, uint256 interestComponent, bool onTime);
    event AddressesSet(address loanProcessor, address creditScorer, address paymentToken);
    event TreasuryAddressSet(address indexed newTreasuryAddress);

    function makePayment(uint256 loanId, uint256 amount) external;
    function getExpectedPayment(uint256 loanId) external view returns (uint256 totalDue, uint256 principalDue, uint256 interestDue); // Simplified view
    function setAddresses(address _loanProcessor, address _creditScorer, address _paymentToken) external;
    function setTreasuryAddress(address _treasuryAddress) external;
    function paymentToken() external view returns(address);
}