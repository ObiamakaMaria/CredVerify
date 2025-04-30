import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { formatEther } from "ethers";
import hre from "hardhat";

describe("PaymentProcess", function () {
    async function deployPayementProcessFixture() {
        const [user] = await hre.ethers.getSigners();

        const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

        const loanAmount = hre.ethers.parseEther("60");
        const userAccountCredited = hre.ethers.parseEther("70");
        const tokenUri = "ipfs://credit-score-metadata";

        const Token = await hre.ethers.getContractFactory("MockERC20");
        const token = await Token.deploy("CredVerify Token", "CVTKN", 18);
        const tokenAddress = token.target;

        const CredVerify = await hre.ethers.getContractFactory("CredVerify");
        const credVerify = await CredVerify.deploy();

        return { user, token, tokenAddress, ADDRESS_ZERO, loanAmount, userAccountCredited, credVerify, tokenUri };
    }

    describe("Deployement", function() {
        it("Should deploy payement process contract.", async function () {
            const {token, ADDRESS_ZERO} = await loadFixture(deployPayementProcessFixture);

            expect(token.target).to.be.not.equal(ADDRESS_ZERO);
        })
    });

    describe("Payment process", function() {
        it("Should pay the loan", async function () {
            const { user, token, tokenAddress, loanAmount, userAccountCredited, credVerify, tokenUri } = await loadFixture(deployPayementProcessFixture);

            await token.mint(credVerify.target, userAccountCredited);

            await token.connect(user).approve(credVerify.target, userAccountCredited);

            await credVerify.setStablecoinApproval(tokenAddress, true);

            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);

            const remainingPaymentsBeforeFirstPayement = (await credVerify.loans(user.address)).remainingPayments 

            const userBalanceBefore = await token.balanceOf(user.address);
            
            await credVerify.makePayment(user.address);

            const userBalanceAfter = await token.balanceOf(user.address);

            expect(userBalanceAfter).to.be.greaterThan(userBalanceBefore);
            expect((await credVerify.loans(user.address)).totalPaid).to.be.not.equal(0);
            expect((await credVerify.loans(user.address)).paymentCount).to.be.equal(1);
            expect((await credVerify.loans(user.address)).remainingPayments).to.be.lessThan(remainingPaymentsBeforeFirstPayement);
        });

        it("Should end the loan", async function () {
            const { user, token, tokenAddress, loanAmount, userAccountCredited, credVerify, tokenUri } = await loadFixture(deployPayementProcessFixture);

            await token.mint(credVerify.target, userAccountCredited);

            await token.connect(user).approve(credVerify.target, userAccountCredited);

            await credVerify.setStablecoinApproval(tokenAddress, true);

            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);

            const remainingPaymentsBeforeFirstPayement = (await credVerify.loans(user.address)).remainingPayments
            
            for(let i = 0; i < remainingPaymentsBeforeFirstPayement; i++) {
                await credVerify.makePayment(user.address);
            };

            expect((await credVerify.loans(user.address)).active).to.be.equal(false);
            expect((await credVerify.loans(user.address)).remainingPayments).to.be.equal(0);
            expect((await credVerify.loans(user.address)).totalPaid).to.be.equal(parseFloat(hre.ethers.formatEther(loanAmount)));
        });
    });
});