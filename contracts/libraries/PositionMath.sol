// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// All prices use 8 decimals (Chainlink standard)
// All sizes use 6 decimals (cUSDT standard)
// Leverage is plaintext uint8 (1x-100x)
library PositionMath {
    uint256 constant PRICE_DECIMALS = 1e8;
    uint256 constant SIZE_DECIMALS = 1e6;
    uint256 constant MAINTENANCE_MARGIN_BPS = 500;  // 5%
    uint256 constant LIQUIDATION_FEE_BPS = 100;     // 1%
    uint256 constant INSURANCE_FEE_BPS = 50;        // 0.5%
    uint256 constant BPS = 10_000;

    // Notional value in cUSDT (6 decimals)
    // notional = size * price / PRICE_DECIMALS
    function notional(uint64 size, uint64 price) internal pure returns (uint256) {
        return (uint256(size) * uint256(price)) / PRICE_DECIMALS;
    }

    // Maintenance margin required in cUSDT (6 decimals)
    function maintenanceMargin(uint64 size, uint64 price) internal pure returns (uint256) {
        return (notional(size, price) * MAINTENANCE_MARGIN_BPS) / BPS;
    }

    // Liquidation fee paid to keeper
    function liquidationFee(uint64 size, uint64 price) internal pure returns (uint256) {
        return (notional(size, price) * LIQUIDATION_FEE_BPS) / BPS;
    }

    // Insurance fund contribution
    function insuranceFee(uint64 size, uint64 price) internal pure returns (uint256) {
        return (notional(size, price) * INSURANCE_FEE_BPS) / BPS;
    }

    // PnL for a position (plaintext, used after keeper decryption)
    // positive = profit, negative = loss (returned as int256)
    function pnl(uint64 size, uint64 entryPrice, uint64 currentPrice, bool isLong) internal pure returns (int256) {
        int256 priceDelta = int256(uint256(currentPrice)) - int256(uint256(entryPrice));
        int256 _notional = int256((uint256(size) * uint256(entryPrice)) / PRICE_DECIMALS);
        int256 rawPnl = (_notional * priceDelta) / int256(uint256(entryPrice));
        return isLong ? rawPnl : -rawPnl;
    }
}
