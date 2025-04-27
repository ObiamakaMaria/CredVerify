# Onchain Credit Score Builder

## Project Vision

An innovative decentralized platform designed to help individuals build verifiable credit histories on the blockchain through structured credit builder loans. This aims to foster financial inclusion for the underbanked while creating sustainable revenue streams.

## Problem Statement

Globally, many adults lack access to traditional financial services due to insufficient or non-existent credit histories. Centralized credit systems often lack transparency and accessibility, creating barriers for individuals seeking to build financial standing.

## Solution Overview

This platform provides a transparent, blockchain-based system enabling users to establish a verifiable financial reputation. The core process involves:

1.  **Collateral Deposit:** Users deposit stablecoins into a smart contract.
2.  **Loan Creation:** A credit builder loan, typically matching the collateral amount, is automatically created.
3.  **Structured Payments:** Users make regular payments (principal + interest) over a defined period.
4.  **Credit Building:** On-time payments are recorded on-chain, contributing positively to a blockchain-based credit score.
5.  **Completion:** Upon loan completion, the user's collateral is returned, and they receive a Credit History NFT representing their repayment record.

## Target Platform

This project will be deployed on **Lisk**, a Layer 2 scaling solution built on the Optimism (OP) Stack and secured by Ethereum. This choice ensures:

*   **Low Transaction Costs:** Making the credit-building process affordable for the target user base.
*   **High Scalability:** Supporting a large number of users and transactions efficiently.
*   **Ethereum Security:** Leveraging the security guarantees of the underlying Ethereum mainnet.

## Core Features

*   Smart contract-managed collateral deposits and returns.
*   Automated credit builder loan creation and management.
*   On-chain tracking of payment history.
*   Transparent credit score calculation based on repayment behavior.
*   Issuance of non-transferable Credit History NFTs upon loan completion.
*   User dashboard for tracking progress and score.
*   Marketplace for connecting users with further financial opportunities (future).

## Technology Stack (Planned)

*   **Smart Contracts:** Solidity
*   **Blockchain Network:** Lisk (OP Stack / Layer 2)
*   **Potential Off-chain Storage:** IPFS/Arweave (for non-critical data)
*   **(Frontend/Backend TBD)**

*(More details on setup, deployment, and contribution will be added as the project progresses.)*

Here's a summary of the steps we've taken to build the Onchain Credit Score Builder smart contract system:Understanding Requirements: We started with the detailed Product Requirements Document (PRD) outlining the vision, user flow, credit scoring mechanism, revenue model, and technical architecture for the platform.Architecture Design: Based on the PRD, we adopted a modular smart contract architecture to separate concerns. This resulted in five core contracts:CollateralManager: Handles deposit, locking, and withdrawal of user collateral.LoanProcessor: Creates and manages the state of the credit builder loans, orchestrating interactions between other contracts.PaymentHandler: Processes incoming user payments, splitting principal and interest (simplified), and interacting with the LoanProcessor and CreditScorer.CreditScorer: Calculates and updates the user's on-chain credit score based on payment history, loan completion/default status (using a simplified model derived from PRD weights).ReputationNFT: Mints a soulbound (non-transferable) ERC721 token upon successful loan completion, representing the user's verified credit history.Interface Definitions: We defined Solidity interfaces (ICollateralManager.sol, ILoanProcessor.sol, etc.) for each contract. This established clear boundaries and function signatures for how the contracts would interact with each other.Smart Contract Implementation: We wrote the Solidity code for each of the five core contracts and their interfaces. Key implementation details include:Using OpenZeppelin libraries for standard implementations (ERC20, ERC721, Ownable, SafeERC20).Implementing the core logic specified in the PRD: 1:1 collateral-to-loan ratio, tracking loan status, basic payment processing, simplified score updates, and NFT minting linked to loan completion.Implementing access control (Ownable for admin functions, specific checks for inter-contract calls like onlyLoanProcessor).Adding events for significant actions (e.g., LoanCreated, CollateralDeposited, ScoreUpdated, NFTMinted).Implementing basic view functions to retrieve state information.Making the ReputationNFT soulbound by overriding transfer functions.Initial Testing: We developed initial unit tests using the Hardhat framework (TypeScript, ethers.js, Chai).Created a MockERC20 contract for testing token interactions.Wrote test suites for CollateralManager and LoanProcessor, focusing on:Deployment validation.Admin function access control and correctness.Core functionality reverts (e.g., invalid inputs, permissions).Successful execution paths (deposit collateral, loan creation).Testing events emission.Verifying state changes.Testing the crucial interaction where CollateralManager successfully triggers loan creation in LoanProcessor.Acknowledged that comprehensive testing across all contracts and integration scenarios is still required.Deployment Script: Finally, we created a Hardhat deployment script (deploy.ts) to automate the process of:Deploying all five core contracts to a network.Logging their addresses.Calling the necessary admin functions (setAddresses, setLoanProcessor, etc.) to link the deployed contracts together correctly.Performing initial configuration, such as setting the supported payment/collateral token address in CollateralManager.Essentially, we've translated the PRD into a functional, albeit initial, set of interconnected smart contracts, verified the core mechanics with tests, and prepared the scripts needed to deploy this system onto a blockchain network. The next phases would involve more rigorous testing, security audits, frontend development, and potential refinement of the on-chain logic (like scoring and payment calculations).

# Why Lisk?
Lisk as the target platform is an excellent decision
Addresses Core Scalability Issues: As a Layer 2 solution built on the Optimism (OP) Stack, Lisk directly tackles the primary concerns identified with deploying on Ethereum L1:
Lower Gas Fees: L2s significantly reduce transaction costs compared to Ethereum mainnet. This makes the frequent, small-value transactions (monthly payments, service fees, score updates) described in your PRD economically viable, even for the target user base with small loan amounts. The ~$4 interest on a $100 loan is no longer overshadowed by potentially high gas costs.
Higher Throughput & Faster Transactions: Lisk will offer much faster confirmation times and handle a greater volume of transactions than Ethereum L1, supporting a potentially large user base making regular payments and interacting with the platform without significant delays.
Leverages Ethereum Security: By being secured by Ethereum, Lisk inherits the robust security guarantees of the mainnet, which is crucial for a financial application handling user collateral and sensitive credit data.
OP Stack Foundation: Building on the Optimism Stack provides several advantages:
EVM Equivalence: Smart contracts written in Solidity can be deployed with minimal changes.
Mature Tooling: Access to established developer tools, infrastructure (like block explorers, wallets), and best practices from the Optimism ecosystem.
Interoperability: Potential for future integration within the broader Optimism "Superchain" ecosystem, enhancing the reach and utility of your Credit History NFTs.
Considerations Moving Forward with Lisk:
Data Storage Strategy: While L2 storage is cheaper than L1, the recommendation to minimize on-chain storage for non-essential data (like granular historical details) still holds for optimal efficiency and cost. Use on-chain storage for critical state and proofs, linking to off-chain data where appropriate.
Upgradability: Implement standard smart contract upgrade patterns (e.g., Proxies) from the start.
KYC Integration: The technical approach for KYC still needs to be defined.
Lisk Specifics: Familiarize your development team with any specific nuances, tools, or best practices recommended for deploying on Lisk within the OP Stack framework.
