// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";

interface IERC7984 {
    function confidentialTransferFrom(address from, address to, externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (bool);
    function confidentialTransfer(address to, externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (bool);
    function balanceOf(address account) external view returns (euint64);
    function approve(address spender, externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (bool);
    function allowance(address owner, address spender) external view returns (euint64);
}
