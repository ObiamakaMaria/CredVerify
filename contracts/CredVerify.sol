// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract CredVerify is Ownable {
    IERC20 public stablecoin; // Stablecoin for collateral and payments 
    uint256 public constant LOAN_DURATION = 12; // 12 months
    uint256 public constant APR = 8; // 8% annual interest rate
   
    constructor(address initialOwner) Ownable(initialOwner) {}
   
}