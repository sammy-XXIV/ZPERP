// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PerpVault.sol";
import "../src/PerpEngine.sol";
import "../src/LiquidationEngine.sol";

/// @dev Deployment order:
///      1. Precompute PerpEngine address from deployer nonce (resolves circular dependency)
///      2. Deploy PerpVault(cUSDT, engineAddr)
///      3. Deploy LiquidationEngine(engineAddr, vault, oracle, keeper, insurance)
///      4. Deploy PerpEngine(vault, oracle, liquidationEngine) — lands at precomputed address
contract Deploy is Script {
    // Chainlink ETH/USD on Sepolia
    address constant ORACLE = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    function run() external {
        address deployer    = vm.envAddress("DEPLOYER_ADDRESS");
        address cUSDT       = vm.envAddress("CUSDT_ADDRESS");
        address keeper      = vm.envAddress("KEEPER_ADDRESS");
        address insurance   = vm.envAddress("INSURANCE_FUND_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // Current nonce before any deployments
        uint64 nonce = vm.getNonce(deployer);

        // PerpEngine will be the 3rd contract deployed (nonce + 2)
        address engineAddr = vm.computeCreateAddress(deployer, nonce + 2);

        // 1. Deploy PerpVault — points to future engine address
        PerpVault vault = new PerpVault(cUSDT, engineAddr);
        console.log("PerpVault deployed:", address(vault));

        // 2. Deploy LiquidationEngine — points to future engine address
        LiquidationEngine liquidationEngine = new LiquidationEngine(
            engineAddr,
            address(vault),
            ORACLE,
            keeper,
            insurance
        );
        console.log("LiquidationEngine deployed:", address(liquidationEngine));

        // 3. Deploy PerpEngine — lands at precomputed engineAddr
        PerpEngine engine = new PerpEngine(
            address(vault),
            ORACLE,
            address(liquidationEngine)
        );
        console.log("PerpEngine deployed:", address(engine));

        require(address(engine) == engineAddr, "Engine address mismatch — check nonce");

        vm.stopBroadcast();

        // Print env block for keeper .env
        console.log("\n--- copy to keeper/.env ---");
        console.log("PERP_ENGINE_ADDRESS=%s", address(engine));
        console.log("LIQUIDATION_ENGINE_ADDRESS=%s", address(liquidationEngine));
        console.log("---------------------------");
    }
}
