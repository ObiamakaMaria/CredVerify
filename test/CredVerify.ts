import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { CredVerify, MockStablecoin } from "../typechain-types";

describe("CredVerify", () => {
  let credVerify: CredVerify;
  let stablecoin: MockStablecoin;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  const depositAmount = ethers.parseUnits("100", 18); // 100 stablecoins




  beforeEach(async () => {
    // Get signers
    [owner, user] = await ethers.getSigners();

    // Deploy mock stablecoin
    const StablecoinFactory = await ethers.getContractFactory("MockStablecoin");
    stablecoin = await StablecoinFactory.deploy();
    await stablecoin.waitForDeployment();

    // Deploy CredVerify
    const CredVerifyFactory = await ethers.getContractFactory("CredVerify");
    credVerify = await CredVerifyFactory.deploy(stablecoin.target);
    await credVerify.waitForDeployment();

    // Mint stablecoins to user and approve CredVerify
    await stablecoin.mint(user.address, ethers.parseUnits("1000", 18));
    await stablecoin.connect(user).approve(credVerify.target, ethers.parseUnits("1000", 18));
  });



 

//collateral deposit test
it("should allow users to deposit collateral", async () => {
  await credVerify.connect(user).depositCollateral(depositAmount);
  const userDeposit = await credVerify.deposits(user.address);
  expect(userDeposit).to.equal(depositAmount);
  const contractBalance = await stablecoin.balanceOf(credVerify.target);
  expect(contractBalance).to.equal(depositAmount);
});

it("should revert if depositing zero amount", async () => {
  await expect(credVerify.connect(user).depositCollateral(0)).to.be.revertedWith(
    "Amount must be greater than 0"
  );
});


});