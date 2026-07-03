// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";
import "./interfaces/IERC7984.sol";

/// @dev Handles cUSDT margin deposits and withdrawals.
///      All balances stored encrypted. Only the owner can decrypt their own margin.
contract PerpVault is SepoliaZamaConfig {
    IERC7984 public immutable cUSDT;
    address public immutable engine;

    // encrypted margin balance per user
    mapping(address => euint64) internal _margins;

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);

    error OnlyEngine();
    error InsufficientMargin();

    modifier onlyEngine() {
        if (msg.sender != engine) revert OnlyEngine();
        _;
    }

    constructor(address _cUSDT, address _engine) {
        cUSDT = IERC7984(_cUSDT);
        engine = _engine;
    }

    /// @dev User deposits encrypted cUSDT margin. Amount encrypted client-side.
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        cUSDT.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        euint64 current = _margins[msg.sender];
        // initialize to zero if first deposit
        if (!FHE.isInitialized(current)) {
            current = FHE.asEuint64(0);
        }
        _margins[msg.sender] = FHE.add(current, amount);
        FHE.allowThis(_margins[msg.sender]);
        FHE.allow(_margins[msg.sender], msg.sender);

        emit Deposited(msg.sender);
    }

    /// @dev User withdraws encrypted amount. Engine validates margin isn't locked.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 current = _margins[msg.sender];

        // only allow withdrawal if amount <= current margin
        euint64 safeAmount = FHE.select(FHE.le(amount, current), amount, FHE.asEuint64(0));
        _margins[msg.sender] = FHE.sub(current, safeAmount);
        FHE.allowThis(_margins[msg.sender]);
        FHE.allow(_margins[msg.sender], msg.sender);

        cUSDT.confidentialTransfer(msg.sender, FHE.toExternal(safeAmount), "");

        emit Withdrawn(msg.sender);
    }

    /// @dev Called by engine to lock margin when opening a position
    function lockMargin(address user, euint64 amount) external onlyEngine returns (euint64 locked) {
        euint64 current = _margins[user];
        euint64 safe = FHE.select(FHE.le(amount, current), amount, FHE.asEuint64(0));
        _margins[user] = FHE.sub(current, safe);
        FHE.allowThis(_margins[user]);
        FHE.allow(_margins[user], user);
        return safe;
    }

    /// @dev Called by engine to return margin after close/liquidation
    function releaseMargin(address user, euint64 amount) external onlyEngine {
        euint64 current = _margins[user];
        if (!FHE.isInitialized(current)) current = FHE.asEuint64(0);
        _margins[user] = FHE.add(current, amount);
        FHE.allowThis(_margins[user]);
        FHE.allow(_margins[user], user);
    }

    function marginOf(address user) external view returns (euint64) {
        return _margins[user];
    }
}
