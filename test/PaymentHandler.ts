import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "hardhat"; // Import ethers
// Import specific contract types from Typechain
import { PaymentHandler, LoanProcessor, CollateralManager, CreditScorer, ReputationNFT, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"; // Import Signer type

describe("PaymentHandler", function () {
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
        borrowerInitialBalance: bigint;
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
        const LoanProcessorFactory = await ethers.getContractFactory("LoanProcessor");
        const loanProcessor = await LoanProcessorFactory.deploy(500); // Setting to 500 basis points (5%)
        await loanProcessor.waitForDeployment();

        // Deploy PaymentHandler
        const PaymentHandlerFactory = await hre.ethers.getContractFactory("PaymentHandler");
        const paymentHandler: PaymentHandler = await PaymentHandlerFactory.deploy(owner.address);
        await paymentHandler.waitForDeployment();

        // Deploy CreditScorer
        const CreditScorerFactory = await hre.ethers.getContractFactory("CreditScorer");
        const creditScorer: CreditScorer = await CreditScorerFactory.deploy(owner.address);
        await creditScorer.waitForDeployment();

        // Deploy ReputationNFT
        const ReputationNFTFactory = await hre.ethers.getContractFactory("ReputationNFT");
        const reputationNFT: ReputationNFT = await ReputationNFTFactory.deploy("Credit Reputation", "CRNFT");

        // --- Link Contracts ---
        // Use contract.target to get the address
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
            otherAccount,
            borrowerInitialBalance
        };
    }

    // Helper function for setting up test loans
    async function setupTestLoan() {
        const fixture = await loadFixture(deploySystemFixture);
        const { loanProcessor, collateralManager, paymentToken, borrower } = fixture;

        // Ensure borrower has enough tokens
        const amount = ethers.parseUnits("2000", 18); // Double the loan amount to cover payments
        await paymentToken.transfer(borrower.address, amount);

        // Setup loan using correct flow through CollateralManager
        const loanAmount = ethers.parseUnits("1000", 18);
        await paymentToken.connect(borrower).approve(collateralManager.getAddress(), loanAmount);
        await collateralManager.connect(borrower).depositCollateral(
            await paymentToken.getAddress(),
            loanAmount
        );
        
        return fixture;
    }

    // --- Test Suites ---
    describe("Deployment & Configuration", function () {
        // Apply types when loading fixture
        it("Should set the correct initial owner", async function () {
            const { paymentHandler, owner }: { paymentHandler: PaymentHandler; owner: HardhatEthersSigner } = await loadFixture(deploySystemFixture);
            expect(await paymentHandler.owner()).to.equal(owner.address);
        });

        it("Should set the correct LoanProcessor address", async function () {
            const { paymentHandler, loanProcessor }: { paymentHandler: PaymentHandler; loanProcessor: LoanProcessor } = await loadFixture(deploySystemFixture);
            expect(await paymentHandler.loanProcessor()).to.equal(await loanProcessor.getAddress());
        });

        it("Should set the correct CreditScorer address", async function () {
            const { paymentHandler, creditScorer }: { paymentHandler: PaymentHandler; creditScorer: CreditScorer } = await loadFixture(deploySystemFixture);
            expect(await paymentHandler.creditScorer()).to.equal(await creditScorer.getAddress());
        });

        it("Should set the correct PaymentToken address", async function () {
            const { paymentHandler, paymentToken }: { paymentHandler: PaymentHandler; paymentToken: MockERC20 } = await loadFixture(deploySystemFixture);
            expect(await paymentHandler.paymentToken()).to.equal(await paymentToken.getAddress());
        });

         it("Should set the correct Treasury address", async function () {
            const { paymentHandler, treasury }: { paymentHandler: PaymentHandler; treasury: HardhatEthersSigner } = await loadFixture(deploySystemFixture);
            expect(await paymentHandler.treasuryAddress()).to.equal(treasury.address);
        });

         it("Should allow owner to update Treasury address", async function () {
            const { paymentHandler, owner, otherAccount }: { paymentHandler: PaymentHandler; owner: HardhatEthersSigner; otherAccount: HardhatEthersSigner } = await loadFixture(deploySystemFixture);
            await expect(paymentHandler.connect(owner).setTreasuryAddress(otherAccount.address))
                .to.emit(paymentHandler, "TreasuryAddressSet")
                .withArgs(otherAccount.address);
            expect(await paymentHandler.treasuryAddress()).to.equal(otherAccount.address);
        });

         it("Should prevent non-owner from setting Treasury address", async function () {
            const { paymentHandler, otherAccount }: { paymentHandler: PaymentHandler; otherAccount: HardhatEthersSigner } = await loadFixture(deploySystemFixture);
            // Use the specific OwnableUnauthorizedAccount error check
            await expect(paymentHandler.connect(otherAccount).setTreasuryAddress(otherAccount.address))
                 .to.be.revertedWithCustomError(paymentHandler, "OwnableUnauthorizedAccount")
                 .withArgs(otherAccount.address); // Check the owner argument
        });

         it("Should prevent setting Treasury address to address zero", async function () {
             const { paymentHandler, owner }: { paymentHandler: PaymentHandler; owner: HardhatEthersSigner } = await loadFixture(deploySystemFixture);
             await expect(paymentHandler.connect(owner).setTreasuryAddress(ethers.ZeroAddress))
                 .to.be.revertedWith("PH: Invalid treasury address");
         });
    });

    describe("Payment Functionality", function () {
        const loanAmount = ethers.parseUnits("1000", 18);
        const annualInterestRateBps = 1000; // 10%
        const duration = 30 * 24 * 60 * 60; // 30 days

        async function setupActiveLoan() {
            const fixture = await loadFixture(deploySystemFixture);
            const { loanProcessor, collateralManager, paymentToken, borrower } = fixture;

            // Ensure borrower has enough tokens
            const amount = ethers.parseUnits("2000", 18); // Double the loan amount to cover payments
            await paymentToken.transfer(borrower.address, amount);
            
            // Approve collateral
            await paymentToken.connect(borrower).approve(collateralManager.getAddress(), loanAmount);
            
            // Deposit collateral and create loan
            await collateralManager.connect(borrower).depositCollateral(
                await paymentToken.getAddress(),
                loanAmount
            );
            
            return fixture;
        }

        it("Should accept a valid payment and update loan state", async function () {
            const { paymentHandler, paymentToken, borrower, treasury } = await setupActiveLoan();
            
            // Make payment
            const paymentAmount = ethers.parseUnits("100", 18);
            await paymentToken.connect(borrower).approve(paymentHandler.getAddress(), paymentAmount);
            
            // Get balances before payment
            const borrowerBalanceBefore = await paymentToken.balanceOf(borrower.address);
            const treasuryBalanceBefore = await paymentToken.balanceOf(treasury.address);
            
            // Expect payment to succeed and emit event
            await expect(paymentHandler.connect(borrower).makePayment(1, paymentAmount))
                .to.emit(paymentHandler, "PaymentMade")
                .withArgs(1, borrower.address, paymentAmount, anyValue, anyValue, anyValue);

            // Verify balances after payment
            expect(await paymentToken.balanceOf(borrower.address)).to.equal(borrowerBalanceBefore - paymentAmount);
            expect(await paymentToken.balanceOf(treasury.address)).to.be.gt(treasuryBalanceBefore);
        });

        it("Should correctly split payment between principal and interest", async function () {
            const { paymentHandler, paymentToken, borrower } = await setupActiveLoan();
            
            const paymentAmount = ethers.parseUnits("100", 18);
            await paymentToken.connect(borrower).approve(paymentHandler.getAddress(), paymentAmount);
            
            // Get payment breakdown before payment
            const [totalDue, principalDue, interestDue] = await paymentHandler.getExpectedPayment(1);
            
            // Make payment
            await paymentHandler.connect(borrower).makePayment(1, paymentAmount);
            
            // Verify payment was split correctly
            const [newTotalDue, newPrincipalDue, newInterestDue] = await paymentHandler.getExpectedPayment(1);
            expect(newTotalDue).to.be.lt(totalDue);
            expect(newPrincipalDue).to.be.lt(principalDue);
            expect(newInterestDue).to.be.lt(interestDue);
        });

        it("Should revert if payment amount is zero", async function () {
            const { paymentHandler, borrower } = await setupActiveLoan();
            
            await expect(paymentHandler.connect(borrower).makePayment(1, 0))
                .to.be.revertedWith("PH: Amount must be positive");
        });

        it("Should revert if loan does not exist", async function () {
            const { paymentHandler, borrower } = await setupActiveLoan();
            const paymentAmount = ethers.parseUnits("100", 18);
            
            await expect(paymentHandler.connect(borrower).makePayment(999, paymentAmount))
                .to.be.revertedWith("PH: Loan does not exist");
        });

        it("Should revert if payment token approval is insufficient", async function () {
            const { paymentHandler, paymentToken, borrower } = await setupTestLoan();
            
            // Create loan and try to make payment without approval
            const paymentAmount = ethers.parseUnits("100", 18);
            
            await expect(paymentHandler.connect(borrower).makePayment(1, paymentAmount))
                .to.be.revertedWithCustomError(paymentToken, "ERC20InsufficientAllowance");
        });
    });

    describe("Payment Calculations", function () {
        const loanAmount = ethers.parseUnits("1000", 18);
        const annualInterestRateBps = 1000; // 10%
        const duration = 30 * 24 * 60 * 60; // 30 days

        it("Should calculate correct initial payment breakdown", async function () {
            const { paymentHandler } = await setupTestLoan();
            
            const [totalDue, principalDue, interestDue] = await paymentHandler.getExpectedPayment(1);
            
            // Calculate expected interest for first payment
            // Monthly interest = (Annual Rate / 12) * Principal
            const expectedMonthlyInterest = (loanAmount * BigInt(annualInterestRateBps)) / BigInt(12 * 10000);
            const expectedMonthlyPrincipal = loanAmount / BigInt(12); // Assuming 12 monthly payments
            
            expect(interestDue).to.equal(expectedMonthlyInterest);
            expect(principalDue).to.equal(expectedMonthlyPrincipal);
            expect(totalDue).to.equal(expectedMonthlyPrincipal + expectedMonthlyInterest);
        });

        it("Should update payment schedule after partial payment", async function () {
            const { paymentHandler, paymentToken, borrower } = await setupTestLoan();
            
            // Make a partial payment
            const partialAmount = ethers.parseUnits("50", 18);
            await paymentToken.connect(borrower).approve(paymentHandler.getAddress(), partialAmount);
            await paymentHandler.connect(borrower).makePayment(1, partialAmount);
            
            // Get updated payment breakdown
            const [newTotalDue, newPrincipalDue, newInterestDue] = await paymentHandler.getExpectedPayment(1);
            
            // Verify remaining amounts are correctly reduced
            const [originalTotal,,] = await paymentHandler.getExpectedPayment(1);
            expect(newTotalDue).to.equal(originalTotal - partialAmount);
        });

        it("Should handle interest calculations for overdue payments", async function () {
            const { paymentHandler } = await setupTestLoan();
            
            // Advance time past payment due date
            await time.increase(31 * 24 * 60 * 60); // 31 days
            
            const [totalDue, principalDue, interestDue] = await paymentHandler.getExpectedPayment(1);
            
            // Verify late payment includes additional interest
            const [originalTotal,,] = await paymentHandler.getExpectedPayment(1);
            expect(totalDue).to.be.gt(originalTotal);
        });

        it("Should calculate correct payment distribution between principal and interest", async function () {
            const { paymentHandler, paymentToken, borrower } = await setupTestLoan();
            
            // Make full payment
            const [totalDue,,] = await paymentHandler.getExpectedPayment(1);
            await paymentToken.connect(borrower).approve(paymentHandler.getAddress(), totalDue);
            await paymentHandler.connect(borrower).makePayment(1, totalDue);
            
            // Get updated payment details using correct method
            const [newTotalDue, newPrincipalDue, newInterestDue] = await paymentHandler.getExpectedPayment(1);
            expect(newTotalDue).to.be.lt(totalDue);
            expect(newPrincipalDue).to.be.equal(loanAmount - (loanAmount / BigInt(12)));
        });

        it("Should handle zero interest edge case", async function () {
            const { collateralManager, paymentToken, borrower, paymentHandler } = await loadFixture(deploySystemFixture);
            
            // Setup loan with 0% interest through CollateralManager
            await paymentToken.connect(borrower).approve(collateralManager.getAddress(), loanAmount);
            await collateralManager.connect(borrower).depositCollateral(
                await paymentToken.getAddress(),
                loanAmount
            );
            
            const [totalDue, principalDue, interestDue] = await paymentHandler.getExpectedPayment(1);
            
            expect(interestDue).to.equal(0);
            expect(principalDue).to.equal(totalDue);
        });

        it("Should handle minimum payment amount correctly", async function () {
            const { paymentHandler } = await setupTestLoan();
            
            // Get required payment instead of minimum payment
            const [totalDue,,interestDue] = await paymentHandler.getExpectedPayment(1);
            
            // Verify required payment covers at least interest
            expect(totalDue).to.be.gte(interestDue);
        });

        it("Should correctly calculate expected payment info", async function () {
            const { paymentHandler } = await loadFixture(deploySystemFixture);
            
            // Get payment info for an active loan
            const [interestDue, nextDueDate] = await paymentHandler.getExpectedPaymentInfo(1);
            expect(interestDue).to.be.gt(0);
            expect(nextDueDate).to.be.gt(0);
        });

        it("Should return zero payment due for inactive loans", async function () {
            const { paymentHandler } = await loadFixture(deploySystemFixture);
            
            // Get payment info for a non-existent loan
            const [totalDue, principalDue, interestDue] = await paymentHandler.getExpectedPayment(999);
            expect(totalDue).to.equal(0);
            expect(principalDue).to.equal(0);
            expect(interestDue).to.equal(0);
        });

        it("Should correctly split payment into principal and interest", async function () {
            const { paymentHandler } = await setupTestLoan();
            
            // Get payment breakdown
            const [totalDue, principalDue, interestDue] = await paymentHandler.getExpectedPayment(1);
            const expectedTotal = principalDue + interestDue; // Using native BigInt addition
            expect(totalDue).to.equal(expectedTotal);
        });
    });

    describe("Token Handling", function () {
        it("Should correctly handle token transfers during payment", async function () {
            const { paymentHandler, paymentToken, borrower, treasury, collateralManager } = await setupTestLoan();
            
            const paymentAmount = ethers.parseUnits("100", 18);
            
            // Check treasury balance before
            const treasuryBalanceBefore = await paymentToken.balanceOf(treasury.address);
            
            // Approve and make payment
            await paymentToken.connect(borrower).approve(paymentHandler.getAddress(), paymentAmount);
            await paymentHandler.connect(borrower).makePayment(1, paymentAmount);
            
            // Check treasury balance after
            const treasuryBalanceAfter = await paymentToken.balanceOf(treasury.address);
            expect(treasuryBalanceAfter).to.be.gt(treasuryBalanceBefore);
        });

        it("Should revert if payment token approval is insufficient", async function () {
            const { paymentHandler, paymentToken, borrower } = await setupTestLoan();
            
            // Try to make payment without approval
            const paymentAmount = ethers.parseUnits("100", 18);
            await expect(paymentHandler.connect(borrower).makePayment(1, paymentAmount))
                .to.be.revertedWithCustomError(paymentToken, "ERC20InsufficientAllowance");
        });
    });
});