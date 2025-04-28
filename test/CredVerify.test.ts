
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("CredVerify", function () {
  // fixture to reuse the same setup in every test
  async function deployCredVerifyFixture() {
    
    const [owner, otherAccount] = await hre.ethers.getSigners();

    // Deploy a mock stablecoin for testing
    const MockStablecoin = await hre.ethers.getContractFactory("MockERC20");
    const stablecoin1 = await MockStablecoin.deploy("Stablecoin1", "STB1", 18);
    const stablecoin2 = await MockStablecoin.deploy("Stablecoin2", "STB2", 18);

    const CredVerify = await hre.ethers.getContractFactory("CredVerify");
    const credVerify = await CredVerify.deploy();

    return { credVerify, owner, otherAccount, stablecoin1, stablecoin2 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { credVerify, owner } = await loadFixture(deployCredVerifyFixture);
      expect(await credVerify.owner()).to.equal(owner.address);
    });

    it("Should have correct constants", async function () {
      const { credVerify } = await loadFixture(deployCredVerifyFixture);
      expect(await credVerify.LOAN_DURATION()).to.equal(12);
      expect(await credVerify.APR()).to.equal(8);
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
      ).to.be.revertedWith("CollateralManager: invalid stablecoin address");
    });
  });
});