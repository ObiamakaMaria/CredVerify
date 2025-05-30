import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect, use } from "chai";
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

            await token.connect(user).approve(credVerify.target, userAccountCredited);

            await credVerify.setStablecoinApproval(tokenAddress, true);

            console.log(await token.balanceOf(user.address));
            console.log(await token.balanceOf(credVerify.target));

            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);

            console.log(await token.balanceOf(user.address));
            console.log(await token.balanceOf(credVerify.target));

            const remainingPaymentsBeforeFirstPayement = (await credVerify.loans(user.address)).remainingPayments 

            const userBalanceBefore = await token.balanceOf(user.address);

            
            await credVerify.makePayment(user.address);

            console.log(await token.balanceOf(user.address));
            console.log(await token.balanceOf(credVerify.target));

            const userBalanceAfter = await token.balanceOf(user.address);
            

            expect(userBalanceBefore).to.be.greaterThan(userBalanceAfter);
            expect((await credVerify.loans(user.address)).totalPaid).to.be.not.equal(0);
            expect((await credVerify.loans(user.address)).paymentCount).to.be.equal(1);
            expect((await credVerify.loans(user.address)).remainingPayments).to.be.lessThan(remainingPaymentsBeforeFirstPayement);
        });

        it("Should end the loan", async function () {
            const { user, token, tokenAddress, loanAmount, userAccountCredited, credVerify, tokenUri } = await loadFixture(deployPayementProcessFixture);

            await token.connect(user).approve(credVerify.target, userAccountCredited);

            await credVerify.setStablecoinApproval(tokenAddress, true);

            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);
            console.log(await token.balanceOf(user.address));
            console.log(await token.balanceOf(credVerify.target));

            const remainingPaymentsBeforeFirstPayement = (await credVerify.loans(user.address)).remainingPayments
            
            for(let i = 0; i < remainingPaymentsBeforeFirstPayement; i++) {
                await credVerify.makePayment(user.address);
                console.log("======================= Month ", i, " =======================");
                console.log("User balance : ", await token.balanceOf(user.address));
                console.log("Contract balance : ", await token.balanceOf(credVerify.target));
                console.log("Loan data : ", await credVerify.loans(user));
            };

            expect((await credVerify.loans(user.address)).active).to.be.equal(false);
            expect((await credVerify.loans(user.address)).remainingPayments).to.be.equal(0);
            expect((await credVerify.loans(user.address)).totalPaid).to.be.equal(parseFloat(hre.ethers.formatEther(loanAmount)));
        });

        it("Should calculate correct credit score after on-time payments", async function () {
            const { user, token, tokenAddress, loanAmount, userAccountCredited, credVerify, tokenUri } = await loadFixture(deployPayementProcessFixture);
        
            await token.connect(user).approve(credVerify.target, userAccountCredited);
            await credVerify.setStablecoinApproval(tokenAddress, true);
            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);
        
            const loan = await credVerify.loans(user.address);
            for (let i = 0; i < loan.remainingPayments; i++) {
                await credVerify.makePayment(user.address);
                await time.increase(30 * 24 * 60 * 60); // simulate 30 days
            }

            const completedLoan = await credVerify.loans(user.address);
            expect(completedLoan.active).to.be.false;
            expect(completedLoan.remainingPayments).to.be.equal(0);
        
            const creditScore = await credVerify.getCreditScore(user.address);
            console.log("User credit score: ", creditScore.toString());
        
            expect(creditScore).to.be.equal(784);
        });

        it("Should reduce credit score if borrower makes late payments", async function () {
            const { user, token, tokenAddress, loanAmount, userAccountCredited, credVerify, tokenUri } = await loadFixture(deployPayementProcessFixture);
        
            await token.connect(user).approve(credVerify.target, userAccountCredited);
            await credVerify.setStablecoinApproval(tokenAddress, true);
            await credVerify.connect(user).createCreditBuilderLoan(tokenAddress, loanAmount, tokenUri);
        
            const loan = await credVerify.loans(user.address);
            for (let i = 0; i < loan.remainingPayments; i++) {
                await time.increase(40 * 24 * 60 * 60);
                await credVerify.makePayment(user.address);
            }
        
            const completedLoan = await credVerify.loans(user.address);
            expect(completedLoan.active).to.be.false;
            expect(completedLoan.remainingPayments).to.be.equal(0);
        
            const creditScore = await credVerify.getCreditScore(user.address);
            console.log("User credit score after late payments: ", creditScore.toString());
        
            expect(creditScore).to.be.lessThan(784);
        });
        
        
    });
});