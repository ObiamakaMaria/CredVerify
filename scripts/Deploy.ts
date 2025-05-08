import { ethers } from 'hardhat';

async function main() {
  const credVerify = await ethers.deployContract("CredVerify");

  await credVerify.waitForDeployment();

  console.log('CredVerify Contract Deployed at ' + credVerify.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});