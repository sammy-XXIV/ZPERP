// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";
import "./PerpVault.sol";
import "./interfaces/IChainlinkOracle.sol";
import "./libraries/PositionMath.sol";

/// @dev Core trading engine. Opens and closes encrypted ETH/USD positions.
///      Size, margin, and entry price are all encrypted. Leverage and direction are plaintext.
contract PerpEngine is ZamaEthereumConfig {
    using PositionMath for *;

    struct Position {
        euint64 margin;       // locked collateral in cUSDT (6 decimals)
        euint64 size;         // position size in ETH quantity (6 decimals) — lets
                              // PnL = size * (P - E) settle homomorphically without
                              // dividing by the encrypted entry price
        euint64 entryPrice;   // ETH price at open (8 decimals)
        uint8   leverage;     // 1x-100x, plaintext
        bool    isLong;       // direction, plaintext
        bool    isOpen;       // status, plaintext
        address owner;
    }

    PerpVault public immutable vault;
    IChainlinkOracle public immutable oracle;
    address public immutable liquidationEngine;

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;

    uint8 constant MAX_LEVERAGE = 50;
    uint32 constant ORACLE_STALENESS = 7200 seconds;

    event PositionOpened(uint256 indexed positionId, address indexed owner, bool isLong, uint8 leverage);
    event PositionClosed(uint256 indexed positionId, address indexed owner);

    error InvalidLeverage();
    error StaleOracle();
    error NotOwner();
    error PositionNotOpen();
    error OnlyLiquidationEngine();

    modifier onlyLiquidationEngine() {
        if (msg.sender != liquidationEngine) revert OnlyLiquidationEngine();
        _;
    }

    constructor(address _vault, address _oracle, address _liquidationEngine) {
        vault = PerpVault(_vault);
        oracle = IChainlinkOracle(_oracle);
        liquidationEngine = _liquidationEngine;
    }

    /// @dev Open a position. User provides encrypted margin + size, plaintext direction + leverage.
    function openPosition(
        externalEuint64 encryptedMargin,
        bytes calldata marginProof,
        externalEuint64 encryptedSize,
        bytes calldata sizeProof,
        bool isLong,
        uint8 leverage
    ) external returns (uint256 positionId) {
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert InvalidLeverage();

        uint64 currentPrice = _getPrice();

        euint64 margin = FHE.fromExternal(encryptedMargin, marginProof);
        euint64 size = FHE.fromExternal(encryptedSize, sizeProof);
        // vault computes on this handle — grant it access for this tx
        FHE.allowTransient(margin, address(vault));
        euint64 lockedMargin = vault.lockMargin(msg.sender, margin);
        euint64 entryPrice = FHE.asEuint64(currentPrice);

        positionId = nextPositionId++;
        Position storage pos = positions[positionId];
        pos.margin = lockedMargin;
        pos.size = size;
        pos.entryPrice = entryPrice;
        pos.leverage = leverage;
        pos.isLong = isLong;
        pos.isOpen = true;
        pos.owner = msg.sender;

        // grant ACL: contract + owner + liquidation engine can read encrypted fields
        FHE.allowThis(pos.margin);
        FHE.allowThis(pos.size);
        FHE.allowThis(pos.entryPrice);
        FHE.allow(pos.margin, msg.sender);
        FHE.allow(pos.size, msg.sender);
        FHE.allow(pos.entryPrice, msg.sender);
        FHE.allow(pos.margin, liquidationEngine);
        FHE.allow(pos.size, liquidationEngine);
        FHE.allow(pos.entryPrice, liquidationEngine);

        userPositions[msg.sender].push(positionId);

        emit PositionOpened(positionId, msg.sender, isLong, leverage);
    }

    /// @dev Owner closes their own position. PnL settled, remaining margin returned.
    function closePosition(uint256 positionId) external {
        Position storage pos = positions[positionId];
        if (!pos.isOpen) revert PositionNotOpen();
        if (pos.owner != msg.sender) revert NotOwner();

        _settleAndClose(positionId, _getPrice());

        emit PositionClosed(positionId, msg.sender);
    }

    /// @dev Called by LiquidationEngine after verifying position is underwater.
    function liquidatePosition(uint256 positionId, address keeper) external onlyLiquidationEngine {
        Position storage pos = positions[positionId];
        if (!pos.isOpen) revert PositionNotOpen();

        uint64 currentPrice = _getPrice();
        _settleAndClose(positionId, currentPrice);

        emit PositionClosed(positionId, pos.owner);
    }

    /// @dev Settles PnL fully homomorphically — nobody learns the position's
    ///      size, entry, or payout. size is ETH qty (6dp), prices 8dp:
    ///      pnlUsd6 = size * |P - E| / 1e8, split as (size * (diff/1e4)) / 1e4
    ///      to stay within euint64 (max ~1.8e19).
    ///      Profit is credited to vault margin; losses are capped at margin.
    function _settleAndClose(uint256 positionId, uint64 currentPrice) internal {
        Position storage pos = positions[positionId];
        pos.isOpen = false;

        euint64 pxNow = FHE.asEuint64(currentPrice);
        ebool up = FHE.ge(pxNow, pos.entryPrice);
        euint64 diff = FHE.select(up, FHE.sub(pxNow, pos.entryPrice), FHE.sub(pos.entryPrice, pxNow));
        euint64 delta = FHE.div(FHE.mul(pos.size, FHE.div(diff, 10_000)), 10_000);

        ebool gained = pos.isLong ? up : FHE.not(up);
        euint64 loss = FHE.select(FHE.le(delta, pos.margin), delta, pos.margin);
        euint64 payout = FHE.select(gained, FHE.add(pos.margin, delta), FHE.sub(pos.margin, loss));

        // pay straight to the owner's wallet — no separate withdraw step
        FHE.allowTransient(payout, address(vault));
        vault.payOut(pos.owner, payout);
    }

    function _getPrice() internal view returns (uint64) {
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();
        if (block.timestamp - updatedAt > ORACLE_STALENESS) revert StaleOracle();
        return uint64(uint256(answer));
    }

    function getPosition(uint256 positionId) external view returns (
        uint8 leverage,
        bool isLong,
        bool isOpen,
        address owner,
        euint64 margin,
        euint64 size,
        euint64 entryPrice
    ) {
        Position storage pos = positions[positionId];
        return (pos.leverage, pos.isLong, pos.isOpen, pos.owner, pos.margin, pos.size, pos.entryPrice);
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }
}
