// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ReputationNFT.sol";

contract CredVerify  {    
    IERC20 public stablecoin; // Stablecoin for collateral and payments 
    uint256 public constant LOAN_DURATION = 12; // 12 months
    uint256 public constant APR = 8; // 8% annual interest rate

}