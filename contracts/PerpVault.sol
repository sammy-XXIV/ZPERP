// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";
import "./interfaces/IERC7984.sol";

/// @dev Handles cUSDT margin deposits and withdrawals.
///      All balances stored encrypted. Only the owner can decrypt their own margin.
contract PerpVault is ZamaEthereumConfig {
    IERC7984 public immutable cUSDT;
    address public immutable engine;
    address public immutable liquidationEngine;

    // encrypted margin balance per user
    mapping(address => euint64) internal _margins;

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);

    error OnlyEngine();
    error OnlyAuthorized();
    error InsufficientMargin();

    modifier onlyEngine() {
        if (msg.sender != engine) revert OnlyEngine();
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != engine && msg.sender != liquidationEngine) revert OnlyAuthorized();
        _;
    }

    constructor(address _cUSDT, address _engine, address _liquidationEngine) {
        cUSDT = IERC7984(_cUSDT);
        engine = _engine;
        liquidationEngine = _liquidationEngine;
    }

    /// @dev User deposits encrypted cUSDT margin. Amount encrypted client-side.
    ///      Caller must first approve this vault via cUSDT.setOperator(vault, until).
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        // The input proof is bound to this vault, so pass the verified handle to the
        // token via the euint64 overload. Credit only what the token actually moved
        // (the token transfers 0 if the user's balance is insufficient).
        FHE.allowTransient(amount, address(cUSDT));
        euint64 transferred = cUSDT.confidentialTransferFrom(msg.sender, address(this), amount);

        euint64 current = _margins[msg.sender];
        // initialize to zero if first deposit
        if (!FHE.isInitialized(current)) {
            current = FHE.asEuint64(0);
        }
        _margins[msg.sender] = FHE.add(current, transferred);
        FHE.allowThis(_margins[msg.sender]);
        FHE.allow(_margins[msg.sender], msg.sender);

        emit Deposited(msg.sender);
    }

    /// @dev User withdraws encrypted amount. Engine validates margin isn't locked.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 current = _margins[msg.sender];
        if (!FHE.isInitialized(current)) current = FHE.asEuint64(0);

        // only allow withdrawal if amount <= current margin
        euint64 safeAmount = FHE.select(FHE.le(amount, current), amount, FHE.asEuint64(0));
        _margins[msg.sender] = FHE.sub(current, safeAmount);
        FHE.allowThis(_margins[msg.sender]);
        FHE.allow(_margins[msg.sender], msg.sender);

        FHE.allowTransient(safeAmount, address(cUSDT));
        cUSDT.confidentialTransfer(msg.sender, safeAmount);

        emit Withdrawn(msg.sender);
    }

    /// @dev Called by engine to lock margin when opening a position.
    ///      Takes what it can from the user's deposited vault margin, then pulls
    ///      the remainder straight from their cUSDT wallet — so a separate deposit
    ///      step is optional. Requires the user to have approved this vault as
    ///      cUSDT operator. Engine must FHE.allowTransient(amount, vault) first.
    function lockMargin(address user, euint64 amount) external onlyEngine returns (euint64 locked) {
        euint64 current = _margins[user];
        if (!FHE.isInitialized(current)) current = FHE.asEuint64(0);

        // homomorphic min(amount, vault balance) — no branching on encrypted values
        euint64 fromVault = FHE.select(FHE.le(amount, current), amount, current);
        _margins[user] = FHE.sub(current, fromVault);
        FHE.allowThis(_margins[user]);
        FHE.allow(_margins[user], user);

        // pull the shortfall from the user's wallet (transfers 0 if none needed;
        // the token transfers min(remainder, wallet balance))
        euint64 remainder = FHE.sub(amount, fromVault);
        FHE.allowTransient(remainder, address(cUSDT));
        euint64 pulled = cUSDT.confidentialTransferFrom(user, address(this), remainder);

        locked = FHE.add(fromVault, pulled);
        // engine stores this handle and grants further ACL on it
        FHE.allowTransient(locked, msg.sender);
    }

    /// @dev Credit margin back to the user's vault balance (kept for pre-funded flows)
    function releaseMargin(address user, euint64 amount) external onlyAuthorized {
        euint64 current = _margins[user];
        if (!FHE.isInitialized(current)) current = FHE.asEuint64(0);
        _margins[user] = FHE.add(current, amount);
        FHE.allowThis(_margins[user]);
        FHE.allow(_margins[user], user);
    }

    /// @dev Pay funds straight to the user's wallet — used on close (settled payout)
    ///      and for liquidation fees, so no separate withdraw step is needed.
    function payOut(address user, euint64 amount) external onlyAuthorized {
        FHE.allowTransient(amount, address(cUSDT));
        cUSDT.confidentialTransfer(user, amount);
    }

    function marginOf(address user) external view returns (euint64) {
        return _margins[user];
    }
}
