export const PERP_ENGINE_ABI = [
  {
    name: "nextPositionId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getPosition",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [
      { name: "leverage",    type: "uint8" },
      { name: "isLong",      type: "bool" },
      { name: "isOpen",      type: "bool" },
      { name: "owner",       type: "address" },
      { name: "margin",      type: "uint256" }, // euint64 handle returned as uint256
      { name: "size",        type: "uint256" }, // euint64 handle
      { name: "entryPrice",  type: "uint256" }, // euint64 handle
    ],
  },
] as const;

export const LIQUIDATION_ENGINE_ABI = [
  {
    name: "liquidated",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "pendingLiquidation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "requestLiquidation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "executeLiquidation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "positionId",          type: "uint256" },
      { name: "decryptedMargin",     type: "uint64" },
      { name: "decryptedSize",       type: "uint64" },
      { name: "decryptedEntryPrice", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

export const CHAINLINK_ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId",         type: "uint80" },
      { name: "answer",          type: "int256" },
      { name: "startedAt",       type: "uint256" },
      { name: "updatedAt",       type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;
