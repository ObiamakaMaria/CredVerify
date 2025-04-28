// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReputationNFT
 * @dev A non-transferable (soulbound) NFT that represents a user's credit history
 */
contract ReputationNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    
    // credit history data
    struct CreditData {
        uint256 score;            // Current credit score (300-850)
        uint256 loanAmount;       // Original loan amount
        uint256 interestRate;     // APR in basis points (800 = 8%)
        uint256 loanDuration;     // Loan duration in months
        uint256 paymentsOnTime;   // Number of payments made on time
        uint256 paymentsMissed;   // Number of payments missed
        bool completed;           // verify if the loan is completed
    }
    
    // Mapping from token ID to credit data
    mapping(uint256 => CreditData) private _creditData;
    
    // Mapping from user address to their token ID
    mapping(address => uint256) private _userTokens;
    
    // Mapping to track if a user has an NFT
    mapping(address => bool) private _hasNFT;
    
    // Events
    event CreditDataUpdated(uint256 indexed tokenId, uint256 newScore, bool onTime);
    event LoanCompleted(uint256 indexed tokenId);
    
    // to be called/deployed when the a user deposits collateral
    constructor(address initialOwner, string memory _nftName, string memory _nftSymbol)
        ERC721(_nftName, _nftSymbol)
        Ownable(initialOwner)
    {}

    // to be called when a user deposits collateral
    /**
     * @dev Mints a new credit history NFT
     * @param to The address to mint the NFT to
     * @param initialScore The initial credit score
     * @param loanAmount The loan amount in stablecoin will be equal to the collateral amount
     * @param interestRate The interest rate in basis points
     * @param loanDuration The loan duration in months
     * @param uri The URI for the NFT metadata
     */
    function mintCreditNFT(
        address to, 
        uint256 initialScore,
        uint256 loanAmount,
        uint256 interestRate,
        uint256 loanDuration,
        string memory uri
    ) public onlyOwner returns (uint256) {
        require(!_hasNFT[to], "User already has a credit NFT");
        require(initialScore >= 300 && initialScore <= 850, "Score out of range");
        
        uint256 tokenId = _nextTokenId++;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        _creditData[tokenId] = CreditData({
            score: initialScore,
            loanAmount: loanAmount,
            interestRate: interestRate,
            loanDuration: loanDuration,
            paymentsOnTime: 0,
            paymentsMissed: 0,
            completed: false
        });
        
        _userTokens[to] = tokenId;
        _hasNFT[to] = true;
        
        return tokenId;
    }
    
    // to be called when the user makes a payment
    /**
     * @dev Updates the credit score
     * @param user The user address
     * @param newScore The new credit score
     */
    function updateCreditData(address user, uint256 newScore, bool onTime) public onlyOwner {
        require(_hasNFT[user], "No credit NFT found for user");
        require(newScore >= 300 && newScore <= 850, "Score out of range");
        
        uint256 tokenId = _userTokens[user];
        
        CreditData storage data = _creditData[tokenId];
        data.score = newScore;

        if (onTime) {
             data.paymentsOnTime += 1;
        } else {
             data.paymentsMissed += 1;
        }
        
        emit CreditDataUpdated(tokenId, newScore, onTime);
    }
    
    /**
     * @dev Marks a loan as completed
     * @param user The user address
     */
    function completeLoan(address user) public onlyOwner {
        require(_hasNFT[user], "No credit NFT found for user");
        
        uint256 tokenId = _userTokens[user];
        _creditData[tokenId].completed = true;
        
        emit LoanCompleted(tokenId);
    }
    
    /**
     * @dev Gets the credit data for a user
     * @param user The user address
     */
    function getCreditData(address user) public view returns (CreditData memory) {
        require(_hasNFT[user], "No credit NFT found for user");
        
        uint256 tokenId = _userTokens[user];
        return _creditData[tokenId];
    }
    
    /**
     * @dev Gets the token ID for a user
     * @param user The user address
     */
    function getUserTokenId(address user) public view returns (uint256) {
        require(_hasNFT[user], "No credit NFT found for user");
        return _userTokens[user];
    }
    
    /**
     * @dev Updates the token URI
     * @param user The user address
     * @param newUri The new URI
     */
    function updateTokenURI(address user, string memory newUri) public onlyOwner {
        require(_hasNFT[user], "No credit NFT found for user");
        
        uint256 tokenId = _userTokens[user];
        _setTokenURI(tokenId, newUri);
    }
    
    // Override required functions
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    /**
     * @dev Override _update to make NFTs non-transferable (soulbound)
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from = address(0)) and burning (to = address(0))
        // But prevent transfers between non-zero addresses
        if (from != address(0) && to != address(0)) {
            revert("ReputationNFT: token is non-transferable");
        }
        
        return super._update(to, tokenId, auth);
    }
}