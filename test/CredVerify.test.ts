import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import hre from "hardhat";

describe("CredVerify", function () {
  // fixture to reuse the same setup in every test
  async function deployCredVerifyFixture() {
    const [owner, borrower, otherAccount] = await hre.ethers.getSigners();

    // Deploy a mock stablecoin for testing
    const MockStablecoin = await hre.ethers.getContractFactory("MockERC20");
    const stablecoin1 = await MockStablecoin.deploy("Stablecoin1", "STB1", 18);
    const stablecoin2 = await MockStablecoin.deploy("Stablecoin2", "STB2", 18);

    // Mint some tokens to the borrower for testing
    await stablecoin1.mint(borrower.address, hre.ethers.parseEther("1000"));
    await stablecoin2.mint(borrower.address, hre.ethers.parseEther("1000"));
    
    // Also mint some to the contract address that will be deployed
    // This is needed so the contract can transfer tokens to the borrower when creating a loan
    const CredVerify = await hre.ethers.getContractFactory("CredVerify");
    const credVerify = await CredVerify.deploy();
    
    // Mint tokens to the contract
    await stablecoin1.mint(credVerify.target, hre.ethers.parseEther("10000"));
    await stablecoin2.mint(credVerify.target, hre.ethers.parseEther("10000"));

    // Get the ReputationNFT contract address
    const reputationNFTAddress = await credVerify.reputationNFT();

    // Get the contract instance of ReputationNFT
    const ReputationNFT = await hre.ethers.getContractFactory("ReputationNFT");
    const reputationNFT = await ReputationNFT.attach(reputationNFTAddress);

    return { 
      credVerify, 
      reputationNFT, 
      owner, 
      borrower, 
      otherAccount, 
      stablecoin1, 
      stablecoin2 
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { credVerify, owner } = await loadFixture(deployCredVerifyFixture);
      expect(await credVerify.owner()).to.equal(owner.address);
    });

    it("Should have correct constants", async function () {
      const { credVerify } = await loadFixture(deployCredVerifyFixture);
      expect(await credVerify.LOAN_DURATION()).to.equal(12);
      // The contract defines APR as 800 (basis points), so we'll test for that
      expect(await credVerify.APR()).to.equal(8);
      expect(await credVerify.MIN_CREDIT_SCORE()).to.equal(300);
      expect(await credVerify.MAX_CREDIT_SCORE()).to.equal(850);
      expect(await credVerify.INITIAL_CREDIT_SCORE()).to.equal(550);
      expect(await credVerify.MIN_DEPOSIT_AMOUNT()).to.equal(hre.ethers.parseEther("50"));
    });

    it("Should deploy ReputationNFT", async function () {
      const { credVerify, reputationNFT } = await loadFixture(deployCredVerifyFixture);
      
      // Check that the ReputationNFT is deployed and owned by CredVerify
      expect(await reputationNFT.owner()).to.equal(credVerify.target);
      expect(await reputationNFT.name()).to.equal("Credit Score History");
      expect(await reputationNFT.symbol()).to.equal("CSH");

      console.log(await reputationNFT.symbol(), "symbol");
      console.log(await reputationNFT.name(), "name");
      console.log(await reputationNFT.owner(), "owner");
    });
  });

  describe("Stablecoin Management", function () {
    it("Should allow owner to approve stablecoins", async function () {
      const { credVerify, stablecoin1, owner } = await loadFixture(deployCredVerifyFixture);
      
      await expect(credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true))
        .to.emit(credVerify, "StablecoinStatusChanged")
        .withArgs(stablecoin1.target, true);
      
      expect(await credVerify.isStablecoinApproved(stablecoin1.target)).to.be.true;
    });

    it("Should allow owner to disapprove stablecoins", async function () {
      const { credVerify, stablecoin1, owner } = await loadFixture(deployCredVerifyFixture);
      
      // First approve
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true);
      
      // Then disapprove
      await expect(credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, false))
        .to.emit(credVerify, "StablecoinStatusChanged")
        .withArgs(stablecoin1.target, false);
      
      expect(await credVerify.isStablecoinApproved(stablecoin1.target)).to.be.false;
    });

    it("Should prevent non-owners from approving stablecoins", async function () {
      const { credVerify, stablecoin1, otherAccount } = await loadFixture(deployCredVerifyFixture);
      
      await expect(
        credVerify.connect(otherAccount).setStablecoinApproval(stablecoin1.target, true)
      ).to.be.revertedWithCustomError(credVerify, "OwnableUnauthorizedAccount");
    });

    it("Should return correct list of approved stablecoins", async function () {
      const { credVerify, stablecoin1, stablecoin2, owner } = await loadFixture(deployCredVerifyFixture);
      
      // Initially empty
      expect(await credVerify.getApprovedStablecoins()).to.deep.equal([]);
      
      // Approve one stablecoin
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true);
      expect(await credVerify.getApprovedStablecoins()).to.deep.equal([stablecoin1.target]);
      
      // Approve second stablecoin
      await credVerify.connect(owner).setStablecoinApproval(stablecoin2.target, true);
      const approved = await credVerify.getApprovedStablecoins();
      expect(approved).to.include(stablecoin1.target);
      expect(approved).to.include(stablecoin2.target);
      expect(approved.length).to.equal(2);
      
      // Disapprove first stablecoin
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, false);
      expect(await credVerify.getApprovedStablecoins()).to.deep.equal([stablecoin2.target]);
    });

    it("Should reject zero address as stablecoin", async function () {
      const { credVerify, owner } = await loadFixture(deployCredVerifyFixture);
      
      await expect(
        credVerify.connect(owner).setStablecoinApproval(hre.ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid stablecoin address");
    });
  });

  describe("Loan Creation", function() {
    it("Should create a loan successfully", async function() {
      const { credVerify, reputationNFT, stablecoin1, owner, borrower } = await loadFixture(deployCredVerifyFixture);
      
      // First approve the stablecoin
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true);
      
      // Approve credVerify contract to spend borrower's stablecoin
      const depositAmount = hre.ethers.parseEther("100");
      await stablecoin1.connect(borrower).approve(credVerify.target, depositAmount);
      console.log(await stablecoin1.allowance(borrower.address, credVerify.target), "allowance");
      
      // Create a loan
      const tokenURI = "ipfs://credit-score-metadata";
      await expect(credVerify.connect(borrower).createLoan(stablecoin1.target, depositAmount, tokenURI))
        .to.emit(credVerify, "LoanCreated")
        .withArgs(borrower.address, stablecoin1.target, 0, depositAmount);
      
      // Check loan details
      const loan = await credVerify.loans(borrower.address);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.stablecoin).to.equal(stablecoin1.target);
      expect(loan.loanAmount).to.equal(depositAmount);
      expect(loan.collateralAmount).to.equal(depositAmount);
      expect(loan.active).to.be.true;
      expect(loan.completed).to.be.false;
      expect(loan.remainingPayments).to.equal(12);
      
      // Check NFT data
      const nftData = await reputationNFT.getCreditData(borrower.address);
      console.log("nftData", nftData);
      expect(nftData.score).to.equal(550); // INITIAL_CREDIT_SCORE
      expect(nftData.loanAmount).to.equal(depositAmount);
      expect(nftData.interestRate).to.equal(800); // 8% in basis points
      expect(nftData.loanDuration).to.equal(12);
      expect(nftData.completed).to.be.false;
    });

    it("Should fail to create a loan with unapproved stablecoin", async function() {
      const { credVerify, stablecoin1, borrower } = await loadFixture(deployCredVerifyFixture);
      
      const depositAmount = hre.ethers.parseEther("100");
      await stablecoin1.connect(borrower).approve(credVerify.target, depositAmount);
      
      await expect(
        credVerify.connect(borrower).createLoan(stablecoin1.target, depositAmount, "ipfs://uri")
      ).to.be.revertedWith("Stablecoin not approved");
    });

    it("Should fail to create a loan with insufficient deposit", async function() {
      const { credVerify, stablecoin1, owner, borrower } = await loadFixture(deployCredVerifyFixture);
      
      // First approve the stablecoin
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true);
      
      const depositAmount = hre.ethers.parseEther("49"); // Below minimum 50
      await stablecoin1.connect(borrower).approve(credVerify.target, depositAmount);
      
      await expect(
        credVerify.connect(borrower).createLoan(stablecoin1.target, depositAmount, "ipfs://uri")
      ).to.be.revertedWith("Amount must be >= $50");
    });

    it("Should fail to create a second loan while one is active", async function() {
      const { credVerify, stablecoin1, stablecoin2, owner, borrower } = await loadFixture(deployCredVerifyFixture);
      
      // Approve both stablecoins
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true);
      await credVerify.connect(owner).setStablecoinApproval(stablecoin2.target, true);
      
      // Create first loan
      const depositAmount = hre.ethers.parseEther("100");
      await stablecoin1.connect(borrower).approve(credVerify.target, depositAmount);
      await credVerify.connect(borrower).createLoan(stablecoin1.target, depositAmount, "ipfs://uri1");
      
      // Try to create a second loan
      await stablecoin2.connect(borrower).approve(credVerify.target, depositAmount);
      await expect(
        credVerify.connect(borrower).createLoan(stablecoin2.target, depositAmount, "ipfs://uri2")
      ).to.be.revertedWith("Active loan exists");
    });
  });

  describe("Monthly Payment Calculation", function() {
    it("Should return a proper loan structure after creation", async function() {
      const { credVerify, stablecoin1, owner, borrower } = await loadFixture(deployCredVerifyFixture);
      
      // Approve stablecoin and create loan
      await credVerify.connect(owner).setStablecoinApproval(stablecoin1.target, true);
      
      const depositAmount = hre.ethers.parseEther("1000");
      await stablecoin1.connect(borrower).approve(credVerify.target, depositAmount);
      await credVerify.connect(borrower).createLoan(stablecoin1.target, depositAmount, "ipfs://uri");
      
      // Get loan details
      const loan = await credVerify.loans(borrower.address);
      
      // Verify loan structure
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.stablecoin).to.equal(stablecoin1.target);
      expect(loan.loanAmount).to.equal(depositAmount);
      expect(loan.collateralAmount).to.equal(depositAmount);
      expect(loan.active).to.be.true;
      expect(loan.remainingPayments).to.equal(12);
      
      // Verify that the monthly payment is calculated and greater than zero
      expect(loan.monthlyPaymentAmount).to.be.gt(0);
    });
  });
});