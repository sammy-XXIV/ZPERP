// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@fhevm/solidity/lib/FHE.sol";

/// @dev Matches the deployed cUSDT wrapper on Sepolia (OpenZeppelin confidential
///      contracts ERC-7984). euint64 is ABI-encoded as bytes32, so these map to
///      the token's bytes32 overloads. Spending on behalf of a holder requires
///      operator approval via setOperator (there is no ERC-20 style allowance).
interface IERC7984 {
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
    function confidentialTransferFrom(address from, address to, euint64 amount) external returns (euint64);
    function confidentialBalanceOf(address account) external view returns (euint64);
    function setOperator(address operator, uint48 until) external;
    function isOperator(address holder, address spender) external view returns (bool);
}
