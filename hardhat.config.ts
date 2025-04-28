import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

// Access environment variables
// const PRIVATE_KEY = process.env.PRIVATE_KEY;
// const ALCHEMY_API_KEY_URL = process.env.ALCHEMY_API_KEY;
// const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
// const LISK_API_KEY_URL = process.env.LISK_API_KEY_URL;

// Check for essential configuration when deploying to live networks
// if (process.env.HARDHAT_NETWORK !== 'hardhat' && 
//     process.env.HARDHAT_NETWORK !== 'localhost' && 
//     PRIVATE_KEY === "0x0000000000000000000000000000000000000000000000000000000000000000") {
//   console.warn(
//     "⚠️  Warning: PRIVATE_KEY not found in .env file. This is needed for deploying to live networks."
//   );
// }

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // Ethereum Testnet
    // sepolia: {
    //   url: ALCHEMY_API_KEY_URL,
    //   accounts: [`0x${PRIVATE_KEY}`],
    // },
    // // Local networks
    // hardhat: {
    //   chainId: 31337,
    // },
    // localhost: {
    //   url: "http://127.0.0.1:8545",
    // },
  },
  etherscan: {
    // apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};

export default config;
