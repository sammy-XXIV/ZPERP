// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";
import "./PerpEngine.sol";
import "./PerpVault.sol";
import "./interfaces/IChainlinkOracle.sol";
import "./libraries/PositionMath.sol";

/// @dev Permissioned keeper liquidation engine.
///
///      Flow:
///      1. Keeper calls requestLiquidation(positionId) — emits event with encrypted handles
///      2. Off-chain: keeper reads decrypted margin/size/entryPrice via KMS gateway (ACL grants access)
///      3. Keeper computes health off-chain using plaintext values
///      4. If unhealthy: keeper calls executeLiquidation(positionId, decryptedValues, proof)
///      5. Contract verifies proof, executes liquidation, pays keeper fee
///
///      For testnet simplicity: step 4 uses keeper-signed attestation (trusted keeper).
///      Production upgrade: replace with on-chain KMS decryption callback verification.
contract LiquidationEngine is ZamaEthereumConfig {
    using PositionMath for *;

    PerpEngine public immutable engine;
    PerpVault public immutable vault;
    IChainlinkOracle public immutable oracle;

    address public keeper;
    address public owner;
    address public insuranceFund;

    uint256 public totalLiquidations;

    // tracks positions pending liquidation to prevent double execution
    mapping(uint256 => bool) public pendingLiquidation;
    mapping(uint256 => bool) public liquidated;

    uint32 constant ORACLE_STALENESS = 7200 seconds;

    event LiquidationRequested(uint256 indexed positionId, address indexed requester);
    event LiquidationExecuted(uint256 indexed positionId, address indexed keeper, uint64 keeperFee, uint64 insuranceFee);
    event KeeperUpdated(address indexed newKeeper);

    error NotKeeper();
    error NotOwner();
    error AlreadyLiquidated();
    error AlreadyPending();
    error PositionHealthy();
    error StaleOracle();
    error PositionNotOpen();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _engine, address _vault, address _oracle, address _keeper, address _insuranceFund) {
        engine = PerpEngine(_engine);
        vault = PerpVault(_vault);
        oracle = IChainlinkOracle(_oracle);
        keeper = _keeper;
        insuranceFund = _insuranceFund;
        owner = msg.sender;
    }

    /// @dev Step 1: Anyone can flag a position for liquidation review.
    ///      Emits event so keeper knows to check this position via KMS gateway.
    function requestLiquidation(uint256 positionId) external {
        if (liquidated[positionId]) revert AlreadyLiquidated();
        if (pendingLiquidation[positionId]) revert AlreadyPending();

        (, , bool isOpen, , , ,) = engine.getPosition(positionId);
        if (!isOpen) revert PositionNotOpen();

        pendingLiquidation[positionId] = true;

        emit LiquidationRequested(positionId, msg.sender);
    }

    /// @dev Step 3: Keeper executes liquidation after off-chain health check.
    ///      Keeper provides decrypted values + current oracle price.
    ///      Contract independently verifies price from oracle (can't fake that).
    ///      Keeper attestation of decrypted values is trusted for testnet.
    ///
    ///      decryptedMargin: plaintext cUSDT margin (6 decimals)
    ///      decryptedSize:   plaintext position size in cUSDT notional (6 decimals)
    ///      decryptedEntryPrice: plaintext ETH price at entry (8 decimals)
    function executeLiquidation(
        uint256 positionId,
        uint64 decryptedMargin,
        uint64 decryptedSize,
        uint64 decryptedEntryPrice
    ) external onlyKeeper {
        if (liquidated[positionId]) revert AlreadyLiquidated();

        (, , bool isOpen, address posOwner, , ,) = engine.getPosition(positionId);
        if (!isOpen) revert PositionNotOpen();

        uint64 currentPrice = _getPrice();

        // verify position is actually underwater using plaintext values from keeper
        int256 unrealizedPnl = PositionMath.pnl(
            decryptedSize,
            decryptedEntryPrice,
            currentPrice,
            _isLong(positionId)
        );

        uint256 effectiveMargin = unrealizedPnl >= 0
            ? uint256(decryptedMargin) + uint256(unrealizedPnl)
            : uint256(decryptedMargin) - _min(uint256(-unrealizedPnl), uint256(decryptedMargin));

        uint256 required = PositionMath.maintenanceMargin(decryptedSize, currentPrice);

        if (effectiveMargin >= required) revert PositionHealthy();

        // mark liquidated before external calls
        liquidated[positionId] = true;
        pendingLiquidation[positionId] = false;
        totalLiquidations++;

        uint64 keeperFeeAmt = uint64(PositionMath.liquidationFee(decryptedSize, currentPrice));
        uint64 insuranceFeeAmt = uint64(PositionMath.insuranceFee(decryptedSize, currentPrice));

        // delegate close to engine
        engine.liquidatePosition(positionId, keeper);

        // engine releases full margin to vault — now redistribute
        // keeper fee: transfer from vault to keeper
        euint64 encKeeperFee = FHE.asEuint64(keeperFeeAmt);
        euint64 encInsuranceFee = FHE.asEuint64(insuranceFeeAmt);

        FHE.allowThis(encKeeperFee);
        FHE.allow(encKeeperFee, keeper);
        FHE.allowThis(encInsuranceFee);
        FHE.allow(encInsuranceFee, insuranceFund);
        // vault computes on these handles — grant it access for this tx
        FHE.allowTransient(encKeeperFee, address(vault));
        FHE.allowTransient(encInsuranceFee, address(vault));

        vault.releaseMargin(keeper, encKeeperFee);
        vault.releaseMargin(insuranceFund, encInsuranceFee);

        emit LiquidationExecuted(positionId, keeper, keeperFeeAmt, insuranceFeeAmt);
    }

    function updateKeeper(address newKeeper) external onlyOwner {
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    function _getPrice() internal view returns (uint64) {
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();
        if (block.timestamp - updatedAt > ORACLE_STALENESS) revert StaleOracle();
        return uint64(uint256(answer));
    }

    function _isLong(uint256 positionId) internal view returns (bool) {
        (, bool isLong, , , , ,) = engine.getPosition(positionId);
        return isLong;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
