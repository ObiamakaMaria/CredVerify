import hre, { ethers } from "hardhat";
import { Addressable } from "ethers";

async function main() {
  console.log("Starting deployment process...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance));

  // --- Configuration ---
  // TODO: Update these values based on your target network and requirements
  const PAYMENT_TOKEN_ADDRESS = "0x..."; // Replace with actual Stablecoin address (e.g., USDC on Polygon/Arbitrum testnet)
  const NFT_NAME = "Onchain Credit Reputation";
  const NFT_SYMBOL = "OCR";
  const EARLY_WITHDRAWAL_FEE_BPS = 500; // 5.00%
  const INITIAL_INTEREST_RATE_BPS = 800; // 8.00% (If needed in constructor, else set via admin)
  const INITIAL_LOAN_DURATION_SECONDS = 31536000; // ~1 year (If needed in constructor, else set via admin)

  if (PAYMENT_TOKEN_ADDRESS === "0x...") {
      console.warn("WARNING: PAYMENT_TOKEN_ADDRESS is not set in deploy script. Please update it.");
      // Optionally, throw an error to prevent deployment without it
      // throw new Error("Payment token address is required.");
  }

  // --- Deployment ---

  console.log("\nDeploying ReputationNFT...");
  const ReputationNFTFactory = await ethers.getContractFactory("ReputationNFT");
  const reputationNFT = await ReputationNFTFactory.deploy(NFT_NAME, NFT_SYMBOL);
  await reputationNFT.waitForDeployment();
  console.log(`ReputationNFT deployed to: ${reputationNFT.target}`);

  console.log("\nDeploying CreditScorer...");
  const CreditScorerFactory = await ethers.getContractFactory("CreditScorer");
  const creditScorer = await CreditScorerFactory.deploy();
  await creditScorer.waitForDeployment();
  console.log(`CreditScorer deployed to: ${creditScorer.target}`);

  console.log("\nDeploying PaymentHandler...");
  const PaymentHandlerFactory = await ethers.getContractFactory("PaymentHandler");
  const paymentHandler = await PaymentHandlerFactory.deploy();
  await paymentHandler.waitForDeployment();
  console.log(`PaymentHandler deployed to: ${paymentHandler.target}`);

  console.log("\nDeploying LoanProcessor...");
  const LoanProcessorFactory = await ethers.getContractFactory("LoanProcessor");
  const loanProcessor = await LoanProcessorFactory.deploy(EARLY_WITHDRAWAL_FEE_BPS);
  await loanProcessor.waitForDeployment();
  console.log(`LoanProcessor deployed to: ${loanProcessor.target}`);

  console.log("\nDeploying CollateralManager...");
  const CollateralManagerFactory = await ethers.getContractFactory("CollateralManager");
  const collateralManager = await CollateralManagerFactory.deploy();
  await collateralManager.waitForDeployment();
  console.log(`CollateralManager deployed to: ${collateralManager.target}`);

  // --- Linking Contracts ---
  console.log("\nLinking contracts...");

  // 1. Link ReputationNFT
  console.log(`Setting LoanProcessor address (${loanProcessor.target}) in ReputationNFT...`);
  let tx = await reputationNFT.connect(deployer).setLoanProcessor(loanProcessor.target);
  await tx.wait(); // Wait for transaction confirmation
  console.log("ReputationNFT linked.");

  // 2. Link CreditScorer
  console.log(`Setting LoanProcessor (${loanProcessor.target}) and PaymentHandler (${paymentHandler.target}) addresses in CreditScorer...`);
  tx = await creditScorer.connect(deployer).setAddresses(loanProcessor.target, paymentHandler.target);
  await tx.wait();
  console.log("CreditScorer linked.");

  // 3. Link PaymentHandler
  console.log(`Setting LoanProcessor (${loanProcessor.target}), CreditScorer (${creditScorer.target}), and PaymentToken (${PAYMENT_TOKEN_ADDRESS}) addresses in PaymentHandler...`);
  tx = await paymentHandler.connect(deployer).setAddresses(loanProcessor.target, creditScorer.target, PAYMENT_TOKEN_ADDRESS);
  await tx.wait();
  console.log("PaymentHandler linked.");

  // 4. Link LoanProcessor
  console.log(`Setting CollateralManager (${collateralManager.target}), PaymentHandler (${paymentHandler.target}), CreditScorer (${creditScorer.target}), and ReputationNFT (${reputationNFT.target}) addresses in LoanProcessor...`);
  tx = await loanProcessor.connect(deployer).setAddresses(
    collateralManager.target,
    paymentHandler.target,
    creditScorer.target,
    reputationNFT.target
  );
  await tx.wait();
  console.log("LoanProcessor linked.");

  // 5. Link CollateralManager
  console.log(`Setting LoanProcessor address (${loanProcessor.target}) in CollateralManager...`);
  tx = await collateralManager.connect(deployer).setLoanProcessor(loanProcessor.target);
  await tx.wait();
  console.log("CollateralManager linked.");

  // --- Initial Configuration ---
  console.log("\n Initial configuration...");

  // Set the supported collateral/payment token in CollateralManager
  console.log(`Setting supported token (${PAYMENT_TOKEN_ADDRESS}) in CollateralManager...`);
  tx = await collateralManager.connect(deployer).setSupportedToken(PAYMENT_TOKEN_ADDRESS, true);
  await tx.wait();
  console.log("The Supported token/stablecoin has been set in CollateralManager.");

  // Optional: Set initial interest rate/duration in LoanProcessor if not using defaults/constructor args
  // console.log(`Setting initial interest rate (${INITIAL_INTEREST_RATE_BPS} BPS) in LoanProcessor...`);
  // tx = await loanProcessor.connect(deployer).setInterestRate(INITIAL_INTEREST_RATE_BPS);
  // await tx.wait();
  // console.log(`Setting initial loan duration (${INITIAL_LOAN_DURATION_SECONDS} seconds) in LoanProcessor...`);
  // tx = await loanProcessor.connect(deployer).setLoanDuration(INITIAL_LOAN_DURATION_SECONDS);
  // await tx.wait();

  console.log("\n>>>>>>Deployment and linking has been completed!<<<<<<");
  console.log("----------------------------------------------------");
  console.log("Deployed Contract Addresses:");
  console.log(`  ReputationNFT:       ${reputationNFT.target}`);
  console.log(`  CreditScorer:        ${creditScorer.target}`);
  console.log(`  PaymentHandler:      ${paymentHandler.target}`);
  console.log(`  LoanProcessor:       ${loanProcessor.target}`);
  console.log(`  CollateralManager:   ${collateralManager.target}`);
  console.log(`  Payment Token Used:  ${PAYMENT_TOKEN_ADDRESS}`);
  console.log("----------------------------------------------------");

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
