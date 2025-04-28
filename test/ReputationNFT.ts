import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("ReputationNFT", function () {
  // We define a fixture to reuse the same setup in every test
  async function deployReputationNFTFixture() {
    // Get the signers
    const [owner, user1, user2] = await hre.ethers.getSigners();

    // Deploy the contract
    const ReputationNFT = await hre.ethers.getContractFactory("ReputationNFT");
    const nft = await ReputationNFT.deploy(owner.address, "Credit History", "CREDIT");

    // Initial values for minting
    const initialScore = 700;
    const loanAmount = hre.ethers.parseEther("10");
    const interestRate = 800; // 8.00%
    const loanDuration = 12; // 12 months
    const tokenURI = "ipfs://QmExample";

    return { nft, owner, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { nft, owner } = await loadFixture(deployReputationNFTFixture);
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("Should have the correct name and symbol", async function () {
      const { nft } = await loadFixture(deployReputationNFTFixture);
      expect(await nft.name()).to.equal("Credit History");
      expect(await nft.symbol()).to.equal("CREDIT");
    });
  });

  describe("Minting", function () {
    it("Should mint a new credit NFT correctly", async function () {
      const { nft, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Check ownership
      expect(await nft.ownerOf(0)).to.equal(user1.address);
      
      // Check token URI
      expect(await nft.tokenURI(0)).to.equal(tokenURI);
      
      // Check user's token ID
      expect(await nft.getUserTokenId(user1.address)).to.equal(0);
      
      // Check credit data
      const creditData = await nft.getCreditData(user1.address);
      expect(creditData.score).to.equal(initialScore);
      expect(creditData.loanAmount).to.equal(loanAmount);
      expect(creditData.interestRate).to.equal(interestRate);
      expect(creditData.loanDuration).to.equal(loanDuration);
      expect(creditData.paymentsOnTime).to.equal(0);
      expect(creditData.paymentsMissed).to.equal(0);
      expect(creditData.completed).to.equal(false);
    });

    it("Should mint a new credit NFT correctly", async function () {
      const { nft, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);
    
      // Mint NFT - make sure to await the transaction
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );
    
      // Check ownership
      expect(await nft.ownerOf(0)).to.equal(user1.address);
      
      // Check token URI
      expect(await nft.tokenURI(0)).to.equal(tokenURI);
      
      // Check user's token ID
      expect(await nft.getUserTokenId(user1.address)).to.equal(0);
      
      // Check credit data
      const creditData = await nft.getCreditData(user1.address);
      expect(creditData.score).to.equal(initialScore);
      expect(creditData.loanAmount).to.equal(loanAmount);
      expect(creditData.interestRate).to.equal(interestRate);
      expect(creditData.loanDuration).to.equal(loanDuration);
      expect(creditData.paymentsOnTime).to.equal(0);
      expect(creditData.paymentsMissed).to.equal(0);
      expect(creditData.completed).to.equal(false);
    });

    it("Should revert if user already has a credit NFT", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint first NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to mint another NFT for the same user
      await expect(
        nft.mintCreditNFT(
          user1.address,
          initialScore,
          loanAmount,
          interestRate,
          loanDuration,
          tokenURI
        )
      ).to.be.revertedWith("User already has a credit NFT");
    });

    it("Should only allow owner to mint", async function () {
      const { nft, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Try to mint as non-owner
      await expect(
        nft.connect(user1).mintCreditNFT(
          user2.address,
          initialScore,
          loanAmount,
          interestRate,
          loanDuration,
          tokenURI
        )
      ).to.be.reverted;
    });
  });

  describe("Credit Data Updates", function () {
    it("Should update credit data correctly", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Update credit score with on-time payment
      const newScore = 720;
      await nft.updateCreditData(user1.address, newScore, true);

      // Check updated data
      const creditData = await nft.getCreditData(user1.address);
      expect(creditData.score).to.equal(newScore);
      expect(creditData.paymentsOnTime).to.equal(1);
      expect(creditData.paymentsMissed).to.equal(0);
      
      // Update with missed payment
      const missedScore = 680;
      await nft.updateCreditData(user1.address, missedScore, false);
      
      // Check updated data
      const updatedCreditData = await nft.getCreditData(user1.address);
      expect(updatedCreditData.score).to.equal(missedScore);
      expect(updatedCreditData.paymentsOnTime).to.equal(1);
      expect(updatedCreditData.paymentsMissed).to.equal(1);
    });

    it("Should emit CreditDataUpdated event", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Update credit score and check event
      const newScore = 720;
      await expect(nft.updateCreditData(user1.address, newScore, true))
        .to.emit(nft, "CreditDataUpdated")
        .withArgs(0, newScore, true);
    });

    it("Should revert if score is out of range", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to update with invalid scores
      await expect(nft.updateCreditData(user1.address, 299, true)).to.be.revertedWith("Score out of range");
      await expect(nft.updateCreditData(user1.address, 851, true)).to.be.revertedWith("Score out of range");
    });

    it("Should revert if no credit NFT found", async function () {
      const { nft, user1 } = await loadFixture(deployReputationNFTFixture);

      // Try to update without minting
      await expect(nft.updateCreditData(user1.address, 700, true)).to.be.revertedWith("No credit NFT found for user");
    });

    it("Should only allow owner to update credit data", async function () {
      const { nft, owner, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to update as non-owner
      await expect(nft.connect(user2).updateCreditData(user1.address, 720, true)).to.be.reverted;
    });
  });

  describe("Loan Completion", function () {
    it("Should mark loan as completed", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Complete loan
      await nft.completeLoan(user1.address);

      // Check data
      const creditData = await nft.getCreditData(user1.address);
      expect(creditData.completed).to.equal(true);
    });

    it("Should emit LoanCompleted event", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Complete loan and check event
      await expect(nft.completeLoan(user1.address))
        .to.emit(nft, "LoanCompleted")
        .withArgs(0);
    });

    it("Should only allow owner to complete loan", async function () {
      const { nft, owner, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to complete loan as non-owner
      await expect(nft.connect(user2).completeLoan(user1.address)).to.be.reverted;
    });
  });

  describe("Token URI Updates", function () {
    it("Should update token URI correctly", async function () {
      const { nft, owner, user1, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Update URI
      const newURI = "ipfs://QmNewExample";
      await nft.updateTokenURI(user1.address, newURI);

      // Check updated URI
      expect(await nft.tokenURI(0)).to.equal(newURI);
    });

    it("Should only allow owner to update token URI", async function () {
      const { nft, owner, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to update as non-owner
      const newURI = "ipfs://QmNewExample";
      await expect(nft.connect(user2).updateTokenURI(user1.address, newURI)).to.be.reverted;
    });
  });

  describe("Non-transferability (Soulbound)", function () {
    it("Should prevent transfers between users", async function () {
      const { nft, owner, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to transfer
      await expect(
        nft.connect(user1).transferFrom(user1.address, user2.address, 0)
      ).to.be.revertedWith("ReputationNFT: token is non-transferable");
    });

    it("Should prevent safe transfers between users", async function () {
      const { nft, owner, user1, user2, initialScore, loanAmount, interestRate, loanDuration, tokenURI } = 
        await loadFixture(deployReputationNFTFixture);

      // Mint NFT
      await nft.mintCreditNFT(
        user1.address,
        initialScore,
        loanAmount,
        interestRate,
        loanDuration,
        tokenURI
      );

      // Try to safe transfer
      await expect(
        nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 0)
      ).to.be.revertedWith("ReputationNFT: token is non-transferable");
    });
  });
});