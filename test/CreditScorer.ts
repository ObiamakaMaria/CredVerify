import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "hardhat";
import { PaymentHandler, LoanProcessor, CollateralManager, CreditScorer, ReputationNFT, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CreditScorer", function () {
  // Define Fixture with explicit types
  async function deploySystemFixture(): Promise<{
    paymentHandler: PaymentHandler;
    loanProcessor: LoanProcessor;
    collateralManager: CollateralManager;
    creditScorer: CreditScorer;
    reputationNFT: ReputationNFT;
    paymentToken: MockERC20;
    owner: HardhatEthersSigner;
    borrower: HardhatEthersSigner;
    treasury: HardhatEthersSigner;
    otherAccount: HardhatEthersSigner;
  }> {
    const [owner, borrower, treasury, otherAccount] = await hre.ethers.getSigners();

    // Deploy Mock ERC20 Token
    const MockERC20Factory = await hre.ethers.getContractFactory("MockERC20");
    const initialSupply = ethers.parseUnits("1000000", 18);
    const paymentToken: MockERC20 = await MockERC20Factory.deploy("Mock Stablecoin", "mUSD", initialSupply);
    const borrowerInitialBalance = ethers.parseUnits("1000", 18);
    await paymentToken.transfer(borrower.address, borrowerInitialBalance);

    // Deploy CollateralManager
    const CollateralManagerFactory = await hre.ethers.getContractFactory("CollateralManager");
    const collateralManager: CollateralManager = await CollateralManagerFactory.deploy(owner.address);

    // Deploy LoanProcessor
    const LoanProcessorFactory = await hre.ethers.getContractFactory("LoanProcessor");
    const earlyWithdrawalFeeBps = 500; // 5%
    const loanProcessor: LoanProcessor = await LoanProcessorFactory.deploy(earlyWithdrawalFeeBps);

    // Deploy CreditScorer
    const CreditScorerFactory = await hre.ethers.getContractFactory("CreditScorer");
    const creditScorer: CreditScorer = await CreditScorerFactory.deploy(owner.address);

    // Deploy other contracts
    const PaymentHandlerFactory = await hre.ethers.getContractFactory("PaymentHandler");
    const paymentHandler: PaymentHandler = await PaymentHandlerFactory.deploy(owner.address);
    
    const ReputationNFTFactory = await hre.ethers.getContractFactory("ReputationNFT");
    const reputationNFT: ReputationNFT = await ReputationNFTFactory.deploy("Credit Reputation", "CRNFT");

    // --- Link Contracts ---
    await collateralManager.connect(owner).setLoanProcessor(await loanProcessor.getAddress());
    await collateralManager.connect(owner).setSupportedToken(await paymentToken.getAddress(), true);

    await loanProcessor.connect(owner).setAddresses(
      await collateralManager.getAddress(),
      await paymentHandler.getAddress(),
      await creditScorer.getAddress(),
      await reputationNFT.getAddress()
    );

    await paymentHandler.connect(owner).setAddresses(
      await loanProcessor.getAddress(),
      await creditScorer.getAddress(),
      await paymentToken.getAddress()
    );
    await paymentHandler.connect(owner).setTreasuryAddress(treasury.address);

    await creditScorer.connect(owner).setAddresses(
      await loanProcessor.getAddress(),
      await paymentHandler.getAddress()
    );

    await reputationNFT.connect(owner).setLoanProcessor(await loanProcessor.getAddress());

    return {
      paymentHandler,
      loanProcessor,
      collateralManager,
      creditScorer,
      reputationNFT,
      paymentToken,
      owner,
      borrower,
      treasury,
      otherAccount
    };
  }

  // --- Test Suites ---
  describe("Deployment & Configuration", function () {
    it("Should set the correct initial owner", async function () {
      const { creditScorer, owner } = await loadFixture(deploySystemFixture);
      expect(await creditScorer.owner()).to.equal(owner.address);
    });

    it("Should set the correct authorized addresses", async function () {
      const { creditScorer, loanProcessor, paymentHandler } = await loadFixture(deploySystemFixture);
      expect(await creditScorer.loanProcessorAddress()).to.equal(await loanProcessor.getAddress());
      expect(await creditScorer.paymentHandlerAddress()).to.equal(await paymentHandler.getAddress());
    });

    it("Should prevent non-owner from setting addresses", async function () {
      const { creditScorer, otherAccount, loanProcessor, paymentHandler } = await loadFixture(deploySystemFixture);
      await expect(creditScorer.connect(otherAccount).setAddresses(
        await loanProcessor.getAddress(),
        await paymentHandler.getAddress()
      )).to.be.revertedWithCustomError(creditScorer, "OwnableUnauthorizedAccount")
        .withArgs(otherAccount.address);
    });

    it("Should prevent setting invalid addresses", async function () {
      const { creditScorer, owner } = await loadFixture(deploySystemFixture);
      await expect(creditScorer.connect(owner).setAddresses(
        ethers.ZeroAddress,
        ethers.ZeroAddress
      )).to.be.revertedWith("CS: Invalid address");
    });
  });

  describe("Access Control", function () {
    it("Should reject calls from unauthorized addresses", async function () {
      const { creditScorer, borrower, otherAccount } = await loadFixture(deploySystemFixture);
      
      // Mock loan data
      const mockLoan = {
        id: 1n,
        borrower: borrower.address,
        collateralToken: ethers.ZeroAddress,
        collateralAmount: 0n,
        principalAmount: 0n,
        annualInterestRateBps: 0n,
        startTime: 0n,
        duration: 0n,
        nextDueDate: 0n,
        status: 0,
        paymentsMade: 0n,
        totalPaidPrincipal: 0n,
        totalPaidInterest: 0n
      };
      
      // Try to record payment as unauthorized address
      await expect(creditScorer.connect(otherAccount)
        .recordPayment(1n, borrower.address, ethers.getBigInt(Math.floor(Date.now() / 1000)), ethers.parseUnits("10", 18), true))
        .to.be.revertedWith("CS: Caller not authorized");
      
      // Try to record loan completion as unauthorized address
      await expect(creditScorer.connect(otherAccount)
        .recordLoanCompletion(1n, borrower.address, mockLoan))
        .to.be.revertedWith("CS: Caller not authorized");
      
      // Try to record loan default as unauthorized address
      await expect(creditScorer.connect(otherAccount)
        .recordLoanDefault(1n, borrower.address, mockLoan))
        .to.be.revertedWith("CS: Caller not authorized");
      
      // Try to record loan termination as unauthorized address
      await expect(creditScorer.connect(otherAccount)
        .recordLoanTermination(1n, borrower.address, mockLoan))
        .to.be.revertedWith("CS: Caller not authorized");
    });
  });

  // Note: To properly test the score calculation functionality, we would need to:
  // 1. Create a mock contract or subclass of CreditScorer that exposes internal methods for testing
  // 2. Properly set up the contract state directly to test specific scenarios
  // 3. Use a different approach for testing the integration between contracts
  
  // For more complete testing, we would also add integration tests that handle the full loan lifecycle:
  // - Creating a loan via CollateralManager
  // - Making payments via PaymentHandler
  // - Tracking score changes across payments
  // - Handling loan completion/default scenarios
}); 