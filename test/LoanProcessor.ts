import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { expect } from "chai";
  import hre, { ethers } from "hardhat";
  import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
  import { CollateralManager, LoanProcessor, MockERC20, PaymentHandler, CreditScorer, ReputationNFT } from "../typechain-types";
  
  const ONE_ETHER = ethers.parseEther("1");
  const TEST_AMOUNT = ethers.parseUnits("100", 6); // Example: 100 USDC
  const ZERO_ADDRESS = ethers.ZeroAddress;
  const EARLY_WITHDRAWAL_FEE_BPS = 500; // 5%
  
  // Use the same fixture as CollateralManager tests as it sets up the whole system
  // Or create a dedicated one if preferred
  async function deployContractsFixture() {
      const [owner, user1, otherAccount, collateralManagerSigner] = await ethers.getSigners(); // Use a signer to represent CM calls
  
      // Deploy Mock ERC20 token
      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const paymentToken = await MockERC20Factory.deploy("Mock USDC", "mUSDC", ethers.parseUnits("1000000", 6));
      await paymentToken.waitForDeployment();
      await paymentToken.transferTokens(user1.address, ethers.parseUnits("1000", 6));
  
      // Deploy Contracts
      const CollateralManagerFactory = await ethers.getContractFactory("CollateralManager");
      const collateralManager = await CollateralManagerFactory.deploy(owner.address);
      await collateralManager.waitForDeployment();
  
  
      const LoanProcessorFactory = await ethers.getContractFactory("LoanProcessor");
      const loanProcessor = await LoanProcessorFactory.deploy(EARLY_WITHDRAWAL_FEE_BPS);
      await loanProcessor.waitForDeployment();
  
      // Deploy Mocks/Actual for other dependencies if needed for specific tests
      const PaymentHandlerFactory = await ethers.getContractFactory("PaymentHandler");
      const paymentHandler = await PaymentHandlerFactory.deploy(owner.address);
      await paymentHandler.waitForDeployment();
  
      const CreditScorerFactory = await ethers.getContractFactory("CreditScorer");
      const creditScorer = await CreditScorerFactory.deploy(owner.address);
      await creditScorer.waitForDeployment();
  
      const ReputationNFTFactory = await ethers.getContractFactory("ReputationNFT");
      const reputationNFT = await ReputationNFTFactory.deploy("Reputation NFT", "rNFT");
      await reputationNFT.waitForDeployment();
  
  
      // --- Link Contracts ---
      // Link PaymentHandler first so it's ready when LoanProcessor needs it
      await paymentHandler.connect(owner).setAddresses(
          loanProcessor.target,
          creditScorer.target,
          paymentToken.target // Set payment token address
      );

      // Then link LoanProcessor with other contracts
      await loanProcessor.connect(owner).setAddresses(
          collateralManagerSigner.address, // Use signer address to simulate CM calls
          paymentHandler.target,
          creditScorer.target,
          reputationNFT.target
      );

      // If testing calls FROM LoanProcessor TO CollateralManager, need to link the other way too
      await collateralManager.connect(owner).setLoanProcessor(loanProcessor.target);
      await collateralManager.connect(owner).setSupportedToken(paymentToken.target, true);
  
  
      return {
          collateralManager, // Actual CM contract instance
          loanProcessor,
          paymentToken,
          owner,
          user1,
          otherAccount,
          collateralManagerSigner, // Signer pretending to be CM
      };
  }
  
  describe("LoanProcessor", function () {
  
    describe("Deployment", function () {
       it("Should set the right owner", async function () {
         const { loanProcessor, owner } = await loadFixture(deployContractsFixture);
         expect(await loanProcessor.owner()).to.equal(owner.address);
       });
  
       it("Should set the early withdrawal fee correctly", async function () {
           const { loanProcessor } = await loadFixture(deployContractsFixture);
           expect(await loanProcessor.getEarlyWithdrawalFeeBps()).to.equal(EARLY_WITHDRAWAL_FEE_BPS);
       });
  
       it("Should have dependent addresses unset initially if not set in constructor", async function () {
          const LoanProcessorFactory = await ethers.getContractFactory("LoanProcessor");
          const lp = await LoanProcessorFactory.deploy(EARLY_WITHDRAWAL_FEE_BPS);
          await lp.waitForDeployment();
          // Check one address, assuming others are similar
          expect(await lp.collateralManager()).to.equal(ZERO_ADDRESS);
       });
    });
  
    describe("Admin Functions", function () {
      it("Should allow owner to set all addresses", async function () {
        const { loanProcessor, owner } = await loadFixture(deployContractsFixture);
        const addr1 = ethers.Wallet.createRandom().address;
        const addr2 = ethers.Wallet.createRandom().address;
        const addr3 = ethers.Wallet.createRandom().address;
        const addr4 = ethers.Wallet.createRandom().address;
  
        await expect(loanProcessor.connect(owner).setAddresses(addr1, addr2, addr3, addr4))
          .to.emit(loanProcessor, "AddressesSet")
          .withArgs(addr1, addr2, addr3, addr4);
  
        expect(await loanProcessor.collateralManager()).to.equal(addr1);
        expect(await loanProcessor.paymentHandler()).to.equal(addr2);
        expect(await loanProcessor.creditScorer()).to.equal(addr3);
        expect(await loanProcessor.reputationNFT()).to.equal(addr4);
      });
  
       it("Should prevent non-owner from setting addresses", async function () {
           const { loanProcessor, otherAccount } = await loadFixture(deployContractsFixture);
           const addr1 = ethers.Wallet.createRandom().address;
           // ... other addresses
           await expect(loanProcessor.connect(otherAccount).setAddresses(addr1, addr1, addr1, addr1))
               .to.be.revertedWithCustomError(loanProcessor, "OwnableUnauthorizedAccount")
               .withArgs(otherAccount.address);
       });
    });
  
  
    describe("notifyCollateralLockedAndCreateLoan", function () {
      it("Should revert if caller is not the CollateralManager", async function () {
        const { loanProcessor, user1, paymentToken, otherAccount } = await loadFixture(deployContractsFixture);
        // otherAccount is not the registered collateralManagerSigner.address
        await expect(loanProcessor.connect(otherAccount).notifyCollateralLockedAndCreateLoan(user1.address, paymentToken.target, TEST_AMOUNT))
          .to.be.revertedWith("LP: Caller is not CollateralManager");
      });
  
       it("Should revert with invalid parameters", async function () {
          const { loanProcessor, user1, paymentToken, collateralManagerSigner } = await loadFixture(deployContractsFixture);
          await expect(loanProcessor.connect(collateralManagerSigner).notifyCollateralLockedAndCreateLoan(ZERO_ADDRESS, paymentToken.target, TEST_AMOUNT))
              .to.be.revertedWith("LP: Invalid user address");
          await expect(loanProcessor.connect(collateralManagerSigner).notifyCollateralLockedAndCreateLoan(user1.address, ZERO_ADDRESS, TEST_AMOUNT))
              .to.be.revertedWith("LP: Invalid token address");
          await expect(loanProcessor.connect(collateralManagerSigner).notifyCollateralLockedAndCreateLoan(user1.address, paymentToken.target, 0))
              .to.be.revertedWith("LP: Invalid collateral amount");
       });
  
       it("Should create a new loan with correct details", async function () {
          const { loanProcessor, user1, paymentToken, collateralManagerSigner, collateralManager } = await loadFixture(deployContractsFixture);
          const expectedLoanId = 1; // First loan
          const txTimestamp = (await time.latest()) + 1; // Estimate timestamp of next block where tx occurs
  
          // Simulate call from CollateralManager
          await expect(loanProcessor.connect(collateralManagerSigner).notifyCollateralLockedAndCreateLoan(user1.address, paymentToken.target, TEST_AMOUNT))
              .to.emit(loanProcessor, "LoanCreated")
              // .withArgs(expectedLoanId, user1.address, paymentToken.target, TEST_AMOUNT, TEST_AMOUNT, anyValue) // Check core args, timestamp is tricky
              .and.to.emit(loanProcessor, "LoanStatusUpdated")
              .withArgs(expectedLoanId, 1); // LoanStatus.Active = 1
  
          const loan = await loanProcessor.getLoanDetails(expectedLoanId);
          expect(loan.id).to.equal(expectedLoanId);
          expect(loan.borrower).to.equal(user1.address);
          expect(loan.collateralToken).to.equal(paymentToken.target);
          expect(loan.collateralAmount).to.equal(TEST_AMOUNT);
          expect(loan.principalAmount).to.equal(TEST_AMOUNT);
          expect(loan.status).to.equal(1); // Active
          // expect(loan.startTime).to.be.closeTo(txTimestamp, 2); // Check timestamp is roughly correct
          expect(loan.paymentsMade).to.equal(0);
          expect(loan.totalPaidPrincipal).to.equal(0);
          expect(loan.totalPaidInterest).to.equal(0);
  
          // Check if LoanProcessor called CollateralManager.storeCollateralInfo
          // This requires mocking or observing calls if not directly checkable via state.
          // We checked the result in the CM test's `getLockedCollateral` after the deposit flow.
       });
    });
  
    // Add describe blocks for processPayment, requestEarlyTermination etc. later
    // describe("Payments", function() { ... });
    // describe("Early Termination", function() { ... });
  
  });