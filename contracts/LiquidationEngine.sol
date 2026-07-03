// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";
import "./PerpEngine.sol";
import "./PerpVault.sol";
import "./interfaces/IChainlinkOracle.sol";
import "./libraries/PositionMath.sol";

/// @dev Trustless liquidation via on-chain KMS proof verification.
///
///      Flow:
///      1. Keeper calls requestLiquidation(positionId) — marks the position's
///         encrypted margin/size/entryPrice publicly decryptable. Permissioned:
///         only the keeper can trigger the reveal, so healthy positions can't
///         be griefed into disclosure. The keeper pre-checks health via its
///         private ACL decryption before flagging.
///      2. Off-chain: ANYONE fetches the public decryption + KMS proof via the
///         Zama SDK (decryptPublicValues).
///      3. ANYONE calls executeLiquidation with the cleartexts + proof.
///         FHE.checkSignatures verifies the KMS signatures on-chain — forged
///         values revert, and the health check runs against the oracle price.
///         The caller earns the liquidation fee.
contract LiquidationEngine is ZamaEthereumConfig {
    using PositionMath for *;

    PerpEngine public immutable engine;
    PerpVault public immutable vault;
    IChainlinkOracle public immutable oracle;

    address public keeper;
    address public owner;
    address public insuranceFund;

    uint256 public totalLiquidations;

    mapping(uint256 => bool) public pendingLiquidation;
    mapping(uint256 => bool) public liquidated;

    uint32 constant ORACLE_STALENESS = 7200 seconds;

    event LiquidationRequested(uint256 indexed positionId, address indexed requester);
    event LiquidationExecuted(uint256 indexed positionId, address indexed executor, uint64 keeperFee, uint64 insuranceFee);
    event KeeperUpdated(address indexed newKeeper);

    error NotKeeper();
    error NotOwner();
    error NotRequested();
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

    /// @dev Step 1: keeper flags a position — its encrypted values become
    ///      publicly decryptable so any executor can obtain KMS-signed cleartexts.
    function requestLiquidation(uint256 positionId) external onlyKeeper {
        if (liquidated[positionId]) revert AlreadyLiquidated();
        if (pendingLiquidation[positionId]) revert AlreadyPending();

        (, , bool isOpen, , euint64 margin, euint64 size, euint64 entryPrice) = engine.getPosition(positionId);
        if (!isOpen) revert PositionNotOpen();

        pendingLiquidation[positionId] = true;

        FHE.makePubliclyDecryptable(margin);
        FHE.makePubliclyDecryptable(size);
        FHE.makePubliclyDecryptable(entryPrice);

        emit LiquidationRequested(positionId, msg.sender);
    }

    /// @dev Step 3: anyone executes with KMS-signed cleartexts. Handle order is
    ///      [margin, size, entryPrice] — must match the off-chain decryptPublicValues
    ///      call. Cleartexts are abi.encode(uint64, uint64, uint64) in that order.
    function executeLiquidation(
        uint256 positionId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        if (liquidated[positionId]) revert AlreadyLiquidated();
        if (!pendingLiquidation[positionId]) revert NotRequested();

        (, bool isLong, bool isOpen, , euint64 margin, euint64 size, euint64 entryPrice) =
            engine.getPosition(positionId);
        if (!isOpen) revert PositionNotOpen();

        // verify the KMS public decryption proof on-chain — forged values revert
        bytes32[] memory handles = new bytes32[](3);
        handles[0] = FHE.toBytes32(margin);
        handles[1] = FHE.toBytes32(size);
        handles[2] = FHE.toBytes32(entryPrice);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        (uint64 decryptedMargin, uint64 decryptedSize, uint64 decryptedEntryPrice) =
            abi.decode(abiEncodedCleartexts, (uint64, uint64, uint64));

        uint64 currentPrice = _getPrice();

        int256 unrealizedPnl = PositionMath.pnl(decryptedSize, decryptedEntryPrice, currentPrice, isLong);

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
        engine.liquidatePosition(positionId, msg.sender);

        // fee to whoever executed, insurance cut to the fund
        euint64 encKeeperFee = FHE.asEuint64(keeperFeeAmt);
        euint64 encInsuranceFee = FHE.asEuint64(insuranceFeeAmt);

        FHE.allowThis(encKeeperFee);
        FHE.allow(encKeeperFee, msg.sender);
        FHE.allowThis(encInsuranceFee);
        FHE.allow(encInsuranceFee, insuranceFund);
        // vault computes on these handles — grant it access for this tx
        FHE.allowTransient(encKeeperFee, address(vault));
        FHE.allowTransient(encInsuranceFee, address(vault));

        vault.releaseMargin(msg.sender, encKeeperFee);
        vault.releaseMargin(insuranceFund, encInsuranceFee);

        emit LiquidationExecuted(positionId, msg.sender, keeperFeeAmt, insuranceFeeAmt);
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

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
