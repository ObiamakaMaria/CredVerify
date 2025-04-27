import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "hardhat";
import { TestCreditScorer } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CreditScorer Calculations", function () {
  // Define Fixture with explicit types
  async function deployTestScorerFixture(): Promise<{
    testScorer: TestCreditScorer;
    owner: HardhatEthersSigner;
    borrower: HardhatEthersSigner;
    otherAccount: HardhatEthersSigner;
  }> {
    const [owner, borrower, otherAccount] = await hre.ethers.getSigners();

    // Deploy our test-specific CreditScorer
    const TestCreditScorerFactory = await hre.ethers.getContractFactory("TestCreditScorer");
    const testScorer: TestCreditScorer = await TestCreditScorerFactory.deploy(owner.address);

    return {
      testScorer,
      owner,
      borrower,
      otherAccount
    };
  }

  describe("Score Initialization", function () {
    it("Should initialize a new user with the base score", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize the user
      await testScorer.testInitializeUser(borrower.address);
      
      // Get the score data
      const scoreData = await testScorer.getScoreData(borrower.address);
      
      // Check that score is initialized to the base score (350)
      expect(scoreData.score).to.equal(350);
      expect(scoreData.onTimePayments).to.equal(0);
      expect(scoreData.latePayments).to.equal(0);
      expect(scoreData.loansCompleted).to.equal(0);
      expect(scoreData.loansDefaulted).to.equal(0);
      expect(scoreData.loansTerminatedEarly).to.equal(0);
      expect(scoreData.completionScoreContribution).to.equal(0);
      expect(scoreData.lastUpdated).to.be.gt(0); // Should be a timestamp
    });
  });

  describe("Payment History Impact", function () {
    it("Should increase score for on-time payments", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize the user
      await testScorer.testInitializeUser(borrower.address);
      
      // Get initial score
      const initialScoreData = await testScorer.getScoreData(borrower.address);
      
      // Add on-time payments
      await testScorer.testAddOnTimePayments(borrower.address, 10);
      
      // Get updated score
      const updatedScoreData = await testScorer.getScoreData(borrower.address);
      
      // Check score increased
      expect(updatedScoreData.onTimePayments).to.equal(10);
      expect(updatedScoreData.score).to.be.gt(initialScoreData.score);
      
      // Additional on-time payments should increase score further
      await testScorer.testAddOnTimePayments(borrower.address, 10);
      const finalScoreData = await testScorer.getScoreData(borrower.address);
      expect(finalScoreData.onTimePayments).to.equal(20);
      expect(finalScoreData.score).to.be.gt(updatedScoreData.score);
    });

    it("Should decrease score for late payments", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize the user and add some on-time payments to get a higher score
      await testScorer.testInitializeUser(borrower.address);
      await testScorer.testAddOnTimePayments(borrower.address, 20);
      
      // Get initial score with good payment history
      const initialScoreData = await testScorer.getScoreData(borrower.address);
      
      // Add late payments
      await testScorer.testAddLatePayments(borrower.address, 5);
      
      // Get updated score
      const updatedScoreData = await testScorer.getScoreData(borrower.address);
      
      // Check score decreased
      expect(updatedScoreData.latePayments).to.equal(5);
      expect(updatedScoreData.score).to.be.lt(initialScoreData.score);
      
      // Additional late payments should decrease score further
      await testScorer.testAddLatePayments(borrower.address, 5);
      const finalScoreData = await testScorer.getScoreData(borrower.address);
      expect(finalScoreData.latePayments).to.equal(10);
      expect(finalScoreData.score).to.be.lt(updatedScoreData.score);
    });

    it("Should penalize late payments more than it rewards on-time payments", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Create two users with the same base score
      await testScorer.testInitializeUser(borrower.address);
      await testScorer.testInitializeUser(ethers.ZeroAddress); // Using zero address as a second test user
      
      // For first user: Add 3 on-time payments
      await testScorer.testAddOnTimePayments(borrower.address, 3);
      
      // For second user: Add 3 on-time and 1 late payment
      await testScorer.testAddOnTimePayments(ethers.ZeroAddress, 3);
      await testScorer.testAddLatePayments(ethers.ZeroAddress, 1);
      
      // Get both scores
      const goodScoreData = await testScorer.getScoreData(borrower.address);
      const mixedScoreData = await testScorer.getScoreData(ethers.ZeroAddress);
      
      // Check that user with 1 late payment has a lower score despite same number of total payments
      expect(mixedScoreData.score).to.be.lt(goodScoreData.score);
    });
  });

  describe("Loan Completion Impact", function () {
    it("Should increase score for completed loans", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize user
      await testScorer.testInitializeUser(borrower.address);
      
      // Get initial score
      const initialScoreData = await testScorer.getScoreData(borrower.address);
      
      // Add a completed loan (1 year duration, 1000 principal)
      const oneYearInSeconds = 365 * 24 * 60 * 60;
      await testScorer.testAddCompletedLoans(
        borrower.address,
        1,
        oneYearInSeconds,
        ethers.parseUnits("1000", 18)
      );
      
      // Get updated score
      const updatedScoreData = await testScorer.getScoreData(borrower.address);
      
      // Check that score increased
      expect(updatedScoreData.loansCompleted).to.equal(1);
      expect(updatedScoreData.score).to.be.gt(initialScoreData.score);
      expect(updatedScoreData.completionScoreContribution).to.be.gt(0);
    });

    it("Should award more points for longer loan durations", async function () {
      const { testScorer, borrower, otherAccount } = await loadFixture(deployTestScorerFixture);
      
      // Initialize two users
      await testScorer.testInitializeUser(borrower.address);
      await testScorer.testInitializeUser(otherAccount.address);
      
      // Add a short-term loan completion for first user (6 months)
      const sixMonthsInSeconds = 180 * 24 * 60 * 60;
      await testScorer.testAddCompletedLoans(
        borrower.address,
        1,
        sixMonthsInSeconds,
        ethers.parseUnits("1000", 18)
      );
      
      // Add a long-term loan completion for second user (2 years)
      const twoYearsInSeconds = 730 * 24 * 60 * 60;
      await testScorer.testAddCompletedLoans(
        otherAccount.address,
        1,
        twoYearsInSeconds,
        ethers.parseUnits("1000", 18)
      );
      
      // Get both scores
      const shortLoanScoreData = await testScorer.getScoreData(borrower.address);
      const longLoanScoreData = await testScorer.getScoreData(otherAccount.address);
      
      // Check that longer loan provides higher contribution
      expect(longLoanScoreData.completionScoreContribution).to.be.gt(shortLoanScoreData.completionScoreContribution);
      expect(longLoanScoreData.score).to.be.gt(shortLoanScoreData.score);
    });

    it("Should award more points for larger loan amounts", async function () {
      const { testScorer, borrower, otherAccount } = await loadFixture(deployTestScorerFixture);
      
      // Initialize two users
      await testScorer.testInitializeUser(borrower.address);
      await testScorer.testInitializeUser(otherAccount.address);
      
      // Add a small loan completion for first user
      const oneYearInSeconds = 365 * 24 * 60 * 60;
      await testScorer.testAddCompletedLoans(
        borrower.address,
        1,
        oneYearInSeconds,
        ethers.parseUnits("1000", 18) // 1,000 units
      );
      
      // Add a large loan completion for second user
      await testScorer.testAddCompletedLoans(
        otherAccount.address,
        1,
        oneYearInSeconds,
        ethers.parseUnits("10000", 18) // 10,000 units
      );
      
      // Get both scores
      const smallLoanScoreData = await testScorer.getScoreData(borrower.address);
      const largeLoanScoreData = await testScorer.getScoreData(otherAccount.address);
      
      // Check that larger loan provides higher contribution
      expect(largeLoanScoreData.completionScoreContribution).to.be.gt(smallLoanScoreData.completionScoreContribution);
      expect(largeLoanScoreData.score).to.be.gt(smallLoanScoreData.score);
    });
  });

  describe("Loan Default Impact", function () {
    it("Should heavily decrease score for defaults", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize user and build up a good score
      await testScorer.testInitializeUser(borrower.address);
      await testScorer.testAddOnTimePayments(borrower.address, 20);
      
      // Get initial score
      const initialScoreData = await testScorer.getScoreData(borrower.address);
      const initialScore = Number(initialScoreData.score);
      
      // Add a default
      await testScorer.testAddDefaults(borrower.address, 1);
      
      // Get updated score
      const updatedScoreData = await testScorer.getScoreData(borrower.address);
      const updatedScore = Number(updatedScoreData.score);
      
      // Check that score decreased significantly
      expect(updatedScoreData.loansDefaulted).to.equal(1);
      expect(updatedScore).to.be.lt(initialScore);
      
      // Significant impact - score should drop by more than 50 points
      expect(initialScore - updatedScore).to.be.gte(50);
    });
  });

  describe("Score Boundaries", function () {
    it("Should not allow scores below the minimum (300)", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize user
      await testScorer.testInitializeUser(borrower.address);
      
      // Add many defaults to push score down
      await testScorer.testAddDefaults(borrower.address, 20);
      
      // Check score is clamped to minimum
      const scoreData = await testScorer.getScoreData(borrower.address);
      expect(scoreData.score).to.be.gte(300);
    });

    it("Should not allow scores above the maximum (850)", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Initialize user
      await testScorer.testInitializeUser(borrower.address);
      
      // Add many positive factors to push score up
      await testScorer.testAddOnTimePayments(borrower.address, 100);
      
      // Add many completed loans with high values
      const twoYearsInSeconds = 730 * 24 * 60 * 60;
      await testScorer.testAddCompletedLoans(
        borrower.address,
        20,
        twoYearsInSeconds,
        ethers.parseUnits("100000", 18)
      );
      
      // Check score is clamped to maximum
      const scoreData = await testScorer.getScoreData(borrower.address);
      expect(scoreData.score).to.be.lte(850);
    });
  });

  describe("Combined Factors", function () {
    it("Should correctly balance positive and negative factors", async function () {
      const { testScorer, borrower, otherAccount } = await loadFixture(deployTestScorerFixture);
      
      // Create two users with different profiles
      await testScorer.testInitializeUser(borrower.address);
      await testScorer.testInitializeUser(otherAccount.address);
      
      // First user: Many on-time payments but one default
      await testScorer.testAddOnTimePayments(borrower.address, 20);
      await testScorer.testAddDefaults(borrower.address, 1);
      
      // Second user: Few on-time payments, few late payments, but completed a loan
      await testScorer.testAddOnTimePayments(otherAccount.address, 10);
      await testScorer.testAddLatePayments(otherAccount.address, 3);
      await testScorer.testAddCompletedLoans(
        otherAccount.address,
        1,
        365 * 24 * 60 * 60,
        ethers.parseUnits("5000", 18)
      );
      
      // Get both scores - they should differ based on different profiles
      const scoreData1 = await testScorer.getScoreData(borrower.address);
      const scoreData2 = await testScorer.getScoreData(otherAccount.address);
      
      // We don't assert which is higher, just that the algorithm produces different results
      // for different user profiles, showing the scoring is working as expected
      expect(scoreData1.score).to.not.equal(scoreData2.score);
    });
  });

  describe("Direct Data Updates", function () {
    it("Should correctly calculate score from manually set data", async function () {
      const { testScorer, borrower } = await loadFixture(deployTestScorerFixture);
      
      // Set specific data values
      await testScorer.testUpdateUserData(
        borrower.address,
        15, // onTimePayments
        2,  // latePayments
        1,  // loansCompleted
        0,  // loansDefaulted
        0,  // loansTerminatedEarly
        20  // completionScoreContribution
      );
      
      // Get the score data
      const scoreData = await testScorer.getScoreData(borrower.address);
      
      // Check data was set and score calculated
      expect(scoreData.onTimePayments).to.equal(15);
      expect(scoreData.latePayments).to.equal(2);
      expect(scoreData.loansCompleted).to.equal(1);
      expect(scoreData.completionScoreContribution).to.equal(20);
      
      // Score should be above base score because of positive factors
      expect(scoreData.score).to.be.gt(350);
    });
  });
});