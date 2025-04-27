// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IReputationNFT {
    event NFTMinted(address indexed owner, uint256 indexed tokenId, uint256 indexed loanId, uint finalScore);

    function mint(address to, uint256 loanId, uint256 finalScore, string calldata metadataURI) external; // Called by LoanProcessor
    function setBaseURI(string calldata baseURI_) external; // Admin controlled
    // Inherits ERC721 functions like tokenURI, ownerOf etc.
}