export const VAULT_ABI = [
  { name: "deposit", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "encryptedAmount", type: "bytes32" }, { name: "inputProof", type: "bytes" }],
    outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "encryptedAmount", type: "bytes32" }, { name: "inputProof", type: "bytes" }],
    outputs: [] },
  { name: "marginOf", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bytes32" }] },
] as const;

export const ENGINE_ABI = [
  { name: "openPosition", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "encryptedMargin",    type: "bytes32" }, { name: "marginProof",  type: "bytes" },
      { name: "encryptedSize",      type: "bytes32" }, { name: "sizeProof",    type: "bytes" },
      { name: "isLong",             type: "bool" },
      { name: "leverage",           type: "uint8" },
    ],
    outputs: [{ name: "positionId", type: "uint256" }] },
  { name: "closePosition", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [] },
  { name: "nextPositionId", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getPosition", type: "function", stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [
      { name: "leverage",    type: "uint8" },
      { name: "isLong",      type: "bool" },
      { name: "isOpen",      type: "bool" },
      { name: "owner",       type: "address" },
      { name: "margin",      type: "bytes32" },
      { name: "size",        type: "bytes32" },
      { name: "entryPrice",  type: "bytes32" },
    ] },
  { name: "getUserPositions", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256[]" }] },
  { name: "PositionOpened", type: "event",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "owner",      type: "address", indexed: true },
      { name: "isLong",     type: "bool",    indexed: false },
      { name: "leverage",   type: "uint8",   indexed: false },
    ] },
] as const;

export const CHAINLINK_ABI = [
  { name: "latestRoundData", type: "function", stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId",         type: "uint80" },
      { name: "answer",          type: "int256" },
      { name: "startedAt",       type: "uint256" },
      { name: "updatedAt",       type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ] },
  { name: "getRoundData", type: "function", stateMutability: "view",
    inputs: [{ name: "_roundId", type: "uint80" }],
    outputs: [
      { name: "roundId",         type: "uint80" },
      { name: "answer",          type: "int256" },
      { name: "startedAt",       type: "uint256" },
      { name: "updatedAt",       type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ] },
] as const;

export const CUSDT_ABI = [
  { name: "setOperator", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }, { name: "until", type: "uint48" }],
    outputs: [] },
  { name: "isOperator", type: "function", stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "bool" }] },
  { name: "confidentialBalanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bytes32" }] },
  { name: "wrap", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [] },
] as const;

// Mock USDT underlying — open public mint, used as the in-app faucet
export const USDT_ABI = [
  { name: "mint", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;

export const LIQUIDATION_ABI = [
  { name: "totalLiquidations", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
] as const;
