import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { assert, expect } from "chai";
import hre, { ethers } from "hardhat";

describe("PaymentProcess", function () {
    async function deployPayementProcessFixture() {
        const [user] = await hre.ethers.getSigners();

        const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

        const loanAmount = hre.ethers.parseEther("15");
        const userAccountCredited = hre.ethers.parseEther("10");
        const tokenUri = "ipfs://credit-score-metadata";

        const Token = await hre.ethers.getContractFactory("MockERC20");
        const token = await Token.deploy("CredVerify Token", "CVTKN", 18);
        const tokenAddress = token.target;

        const CredVerify = await hre.ethers.getContractFactory("CredVerify");
        const credVerify = await CredVerify.deploy();

        const PayementProcess = await hre.ethers.getContractFactory("PaymentProcess");
        const payementProcess = await PayementProcess.deploy();

        return { user, token, tokenAddress, payementProcess, ADDRESS_ZERO, loanAmount, userAccountCredited, credVerify, tokenUri };
    }

    describe("Deployement", function() {
        it("Should deploy payement process contract.", async function () {
            const {token, ADDRESS_ZERO} = await loadFixture(deployPayementProcessFixture);

            expect(token.target).to.be.not.equal(ADDRESS_ZERO);
        })
    });

    describe("Payment process", function() {
        it("Should pay the loan", async function () {
            const { user, token, tokenAddress, payementProcess, loanAmount, userAccountCredited, credVerify, tokenUri } = await loadFixture(deployPayementProcessFixture);

            await token.mint(payementProcess.target, userAccountCredited);

            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);
            
            await payementProcess.makePayment(user.address);

            expect((await payementProcess.loans(user.address)).monthlyPaymentAmount).to.be.equal((await payementProcess.loans(user.address)).totalPaid)
    })
});});