import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";

describe("PaymentProcess", function () {
    async function deployPayementProcessFixture() {
        const [user] = await hre.ethers.getSigners();

        const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

        const Token = await hre.ethers.getContractFactory("MockERC20");
        const token = await Token.deploy("CredVerify Token", "CVTKN", 18);
        const tokenAddress = token.target;

        const PayementProcess = await hre.ethers.getContractFactory("PaymentProcess");
        const payementProcess = await PayementProcess.deploy();

        return { user, token, tokenAddress, payementProcess, ADDRESS_ZERO};
    }

    describe("Deployement", function() {
        it("Should deploy payement process contract.", async function () {
            const {token, ADDRESS_ZERO} = await loadFixture(deployPayementProcessFixture);

            expect(token.target).to.be.not.equal(ADDRESS_ZERO);
        })
    });

    describe("Payment process", function() {
        it("Should pay the loan", async function () {
            const {user, token, tokenAddress, payementProcess} = await loadFixture(deployPayementProcessFixture);

            token.mint(user, hre.ethers.parseEther("99"));

            payementProcess.initiateLoan(tokenAddress, hre.ethers.parseEther("10"), 8, 12);

            payementProcess.makePayment(1);
        })
    })
});