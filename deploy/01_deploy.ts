import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const CHAINLINK_ORACLE = "0x694AA1769357215DE4FAC081bf1f309aDC325306"; // ETH/USD Sepolia
const CUSDT_ADDRESS   = "0x4E7B06D78965594eB5EF5414c357ca21E1554491"; // cUSDT Sepolia
const KEEPER_ADDRESS  = "0x518A612F93d3D83495879bE50C6292d26C0aeC2c";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deployer:", deployer);

  // Insurance fund = deployer for testnet
  const insurance = deployer;

  // ── 1. Pre-compute PerpEngine address (resolves circular dependency) ──
  const nonce = await ethers.provider.getTransactionCount(deployer);
  const engineAddr = ethers.getCreateAddress({ from: deployer, nonce: nonce + 2 });
  console.log("Pre-computed PerpEngine address:", engineAddr);

  // ── 2. Deploy PerpVault ──
  const vault = await deploy("PerpVault", {
    from: deployer,
    args: [CUSDT_ADDRESS, engineAddr],
    log: true,
    waitConfirmations: 1,
  });
  console.log("PerpVault:", vault.address);

  // ── 3. Deploy LiquidationEngine ──
  const liqEngine = await deploy("LiquidationEngine", {
    from: deployer,
    args: [engineAddr, vault.address, CHAINLINK_ORACLE, KEEPER_ADDRESS, insurance],
    log: true,
    waitConfirmations: 1,
  });
  console.log("LiquidationEngine:", liqEngine.address);

  // ── 4. Deploy PerpEngine (must land at engineAddr) ──
  const engine = await deploy("PerpEngine", {
    from: deployer,
    args: [vault.address, CHAINLINK_ORACLE, liqEngine.address],
    log: true,
    waitConfirmations: 1,
  });
  console.log("PerpEngine:", engine.address);

  if (engine.address.toLowerCase() !== engineAddr.toLowerCase()) {
    throw new Error(`Address mismatch: expected ${engineAddr}, got ${engine.address}`);
  }

  console.log("\nAll contracts deployed successfully");
  console.log("\n--- Copy to frontend/.env ---");
  console.log(`VITE_PERP_ENGINE_ADDRESS=${engine.address}`);
  console.log(`VITE_LIQUIDATION_ENGINE_ADDRESS=${liqEngine.address}`);
  console.log(`VITE_PERP_VAULT_ADDRESS=${vault.address}`);
  console.log("-----------------------------");
};

deploy.tags = ["all", "zperp"];
export default deploy;
