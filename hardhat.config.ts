import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import type { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "fs";

// Load .env manually (no dotenv package dependency)
function loadEnv(): Record<string, string> {
  try {
    const raw = require("fs").readFileSync(".env", "utf8") as string;
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const [k, ...v] = line.split("=");
      if (k && v.length) env[k.trim()] = v.join("=").trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();

const DEPLOYER_PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
const SEPOLIA_RPC_URL = env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org";
const ETHERSCAN_API_KEY = env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: {
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
    deploy: "./deploy",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
