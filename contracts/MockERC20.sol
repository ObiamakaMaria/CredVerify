// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimalPlaces
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _decimals = decimalPlaces;
        _mint(msg.sender, 1000000 * 10 ** decimalPlaces);
    }

    // Override decimals if needed (default is 18)
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // Mint additional tokens (only owner)
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    // Burn tokens (only owner)
    function burn(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
    }

    // Faucet function for easy testing - anyone can get free tokens
    function faucet(address recipient, uint256 amount) public {
        _mint(recipient, amount);
    }

    // Approve and transfer in one transaction (helpful for testing)
    function approveAndTransfer(
        address spender,
        uint256 amount,
        address recipient
    ) public returns (bool) {
        approve(spender, amount);
        transfer(recipient, amount);
        return true;
    }
}