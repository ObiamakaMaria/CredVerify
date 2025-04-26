// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CollateralManager is Ownable {
    IERC20 public stablecoin; // The stablecoin used for collateral
    mapping(address => uint256) public deposits;

    constructor(address _stablecoin) {
        stablecoin = IERC20(_stablecoin);
    }

    function depositCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        stablecoin.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
    }

    function withdrawCollateral(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "Insufficient balance");
        deposits[msg.sender] -= amount;
        stablecoin.transfer(msg.sender, amount);
    }
}