// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IReputationNFT.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol"; // For token URI generation if needed

contract ReputationNFT is IReputationNFT, ERC721, ERC721URIStorage, Ownable {

    address public loanProcessorAddress;
    uint256 private nextTokenId;
    string private _baseTokenURI; // Optional base URI

    modifier onlyLoanProcessor() {
        require(msg.sender == loanProcessorAddress, "NFT: Caller is not LoanProcessor");
        _;
    }

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) Ownable(msg.sender) {
        nextTokenId = 1; // Start token IDs from 1
    }

    function setLoanProcessor(address _loanProcessorAddress) external onlyOwner {
         require(_loanProcessorAddress != address(0), "NFT: Invalid LoanProcessor address");
         loanProcessorAddress = _loanProcessorAddress;
    }

    function setBaseURI(string calldata baseURI_) external override onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // Called by LoanProcessor upon loan completion
    function mint(address to, uint256 loanId, uint256 finalScore, string calldata metadataURI) external override onlyLoanProcessor {
        require(to != address(0), "NFT: Mint to the zero address");
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId); // ERC721 mint function
        _setTokenURI(tokenId, metadataURI); // ERC721URIStorage function

        // Emit custom event with more context
        emit NFTMinted(to, tokenId, loanId, finalScore);
    }

    // Override ERC721URIStorage's tokenURI to potentially combine base URI
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        // Requires the token to exist, checked by ERC721URIStorage._requireMinted
        return super.tokenURI(tokenId); // Uses ERC721URIStorage logic which combines baseURI if set
    }

    // --- Soulbound Implementation ---
    // Prevent transfers after minting
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "ReputationNFT: Token is soulbound and cannot be transferred, only minted or burned.");
        return super._update(to, tokenId, auth);
    }

    // --- Required by ERC721URIStorage ---
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

     // Optional: Allow owner/admin to burn tokens if necessary
    function burn(uint256 tokenId) public virtual onlyOwner {
         // _requireMinted(tokenId); // Check exists implicitly in _burn
         _burn(tokenId);
     }
}