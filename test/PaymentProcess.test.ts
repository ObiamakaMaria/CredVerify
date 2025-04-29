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
        const interestRate = 800;
        const loanDuration = 12;
        const userAccountCredited = hre.ethers.parseEther("10");

        const Token = await hre.ethers.getContractFactory("MockERC20");
        const token = await Token.deploy("CredVerify Token", "CVTKN", 18);
        const tokenAddress = token.target;

        const PayementProcess = await hre.ethers.getContractFactory("PaymentProcess");
        const payementProcess = await PayementProcess.deploy();

        return { user, token, tokenAddress, payementProcess, ADDRESS_ZERO, loanAmount, interestRate, loanDuration, userAccountCredited };
    }

    describe("Deployement", function() {
        it("Should deploy payement process contract.", async function () {
            const {token, ADDRESS_ZERO} = await loadFixture(deployPayementProcessFixture);

            expect(token.target).to.be.not.equal(ADDRESS_ZERO);
        })
    });

    describe("Payment process", function() {
        it("Should pay the loan", async function () {
            const { user, token, tokenAddress, payementProcess, ADDRESS_ZERO, loanAmount, interestRate, loanDuration, userAccountCredited } = await loadFixture(deployPayementProcessFixture);

            await token.mint(payementProcess.target, userAccountCredited);

            console.log("", await token.balanceOf(payementProcess.target));
            console.log(await token.balanceOf(user));

            token.connect(user).approve(payementProcess.target, loanAmount);
            
            await payementProcess.connect(user).initiateLoan(tokenAddress, loanAmount, 10, 12);

            console.log(await token.balanceOf(payementProcess.target));
            console.log(await token.balanceOf(user));

            // console.log(await payementProcess.loans(0));
            
            payementProcess.makePayment(0);

            console.log(await token.balanceOf(payementProcess.target));
            console.log(await token.balanceOf(user));

            // console.log(await payementProcess.loans(0));

            // expect(await token.balanceOf(user)).to.be.greaterThan(0);
        })
    })
});