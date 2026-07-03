import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { CHAINLINK_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";

// Standalone client so chart/feed data doesn't depend on wallet connection
export const oracleClient = createPublicClient({
  chain: sepolia,
  transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL),
});

export interface OracleRound {
  roundId: bigint;
  price: number;      // USD, 8 decimals already divided out
  updatedAt: number;  // unix seconds
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type TF = "1h" | "4h" | "1d";

export const TF_SECONDS: Record<TF, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

// Chainlink proxy roundId = (phaseId << 64) | aggregatorRoundId.
// Walking back within the current phase gives contiguous history.
const AGG_ROUND_MASK = 0xffffffffffffffffn;

export async function fetchLatestRound(): Promise<OracleRound> {
  const [roundId, answer, , updatedAt] = await oracleClient.readContract({
    address: ADDRESSES.oracle,
    abi: CHAINLINK_ABI,
    functionName: "latestRoundData",
  });
  return {
    roundId,
    price: Number(answer) / 1e8,
    updatedAt: Number(updatedAt),
  };
}

export async function fetchRoundHistory(count = 240): Promise<OracleRound[]> {
  const latest = await fetchLatestRound();

  const ids: bigint[] = [];
  for (let i = 1n; i <= BigInt(count); i++) {
    const id = latest.roundId - i;
    if ((id & AGG_ROUND_MASK) === 0n) break; // phase boundary — no older rounds in this phase
    ids.push(id);
  }

  const results = await oracleClient.multicall({
    contracts: ids.map((id) => ({
      address: ADDRESSES.oracle,
      abi: CHAINLINK_ABI,
      functionName: "getRoundData" as const,
      args: [id] as const,
    })),
    allowFailure: true,
  });

  const rounds: OracleRound[] = [latest];
  results.forEach((r) => {
    if (r.status !== "success") return;
    const [roundId, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
    if (answer <= 0n || updatedAt === 0n) return;
    rounds.push({ roundId, price: Number(answer) / 1e8, updatedAt: Number(updatedAt) });
  });

  rounds.sort((a, b) => a.updatedAt - b.updatedAt);
  return rounds;
}

// Bucket real oracle updates into OHLC candles. Buckets with no update are
// skipped (Sepolia ETH/USD updates roughly hourly, so sub-1h TFs are pointless).
export function buildCandles(rounds: OracleRound[], tfSec: number): Candle[] {
  const candles: Candle[] = [];
  let cur: Candle | null = null;

  for (const r of rounds) {
    const slot = Math.floor(r.updatedAt / tfSec) * tfSec;
    if (!cur || cur.time !== slot) {
      const open = cur ? cur.close : r.price;
      if (cur) candles.push(cur);
      cur = {
        time: slot,
        open,
        high: Math.max(open, r.price),
        low: Math.min(open, r.price),
        close: r.price,
      };
    } else {
      cur.high = Math.max(cur.high, r.price);
      cur.low = Math.min(cur.low, r.price);
      cur.close = r.price;
    }
  }
  if (cur) candles.push(cur);
  return candles;
}
