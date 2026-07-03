import {
  publicClient,
  walletClient,
  PERP_ENGINE_ADDRESS,
  LIQUIDATION_ENGINE_ADDRESS,
  ORACLE_ADDRESS,
  MAX_SCAN,
  account,
} from "./config.js";
import { PERP_ENGINE_ABI, LIQUIDATION_ENGINE_ABI, CHAINLINK_ABI } from "./abis.js";
import { decryptPositionValues } from "./decrypt.js";
import { isUndercollateralized } from "./health.js";

const ORACLE_STALENESS_MS = 7_200_000; // 2h — Sepolia Chainlink updates ~hourly

async function getCurrentPrice(): Promise<bigint> {
  const result = await publicClient.readContract({
    address: ORACLE_ADDRESS,
    abi: CHAINLINK_ABI,
    functionName: "latestRoundData",
  }) as [bigint, bigint, bigint, bigint, bigint];

  const [, answer, , updatedAt] = result;
  const age = Date.now() - Number(updatedAt) * 1000;
  if (age > ORACLE_STALENESS_MS) throw new Error(`Stale oracle: ${age}ms old`);
  if (answer <= 0n) throw new Error("Invalid oracle price");

  return answer;
}

async function getTotalPositions(): Promise<bigint> {
  return await publicClient.readContract({
    address: PERP_ENGINE_ADDRESS,
    abi: PERP_ENGINE_ABI,
    functionName: "nextPositionId",
  });
}

async function getPosition(id: bigint) {
  return await publicClient.readContract({
    address: PERP_ENGINE_ADDRESS,
    abi: PERP_ENGINE_ABI,
    functionName: "getPosition",
    args: [id],
  });
}

async function isAlreadyLiquidated(id: bigint): Promise<boolean> {
  return await publicClient.readContract({
    address: LIQUIDATION_ENGINE_ADDRESS,
    abi: LIQUIDATION_ENGINE_ABI,
    functionName: "liquidated",
    args: [id],
  });
}

async function executeLiquidation(
  positionId: bigint,
  margin: bigint,
  size: bigint,
  entryPrice: bigint
) {
  console.log(`[liquidate] executing position ${positionId}`);

  const hash = await walletClient.writeContract({
    address: LIQUIDATION_ENGINE_ADDRESS,
    abi: LIQUIDATION_ENGINE_ABI,
    functionName: "executeLiquidation",
    args: [positionId, margin, size, entryPrice],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[liquidate] position ${positionId} liquidated — tx: ${receipt.transactionHash}`);
}

export async function scanAndLiquidate() {
  let currentPrice: bigint;
  try {
    currentPrice = await getCurrentPrice();
  } catch (err) {
    console.error(`[scan] oracle error, skipping cycle:`, err);
    return;
  }

  const total = await getTotalPositions();
  const scanUpTo = total < BigInt(MAX_SCAN) ? total : BigInt(MAX_SCAN);

  console.log(`[scan] checking ${scanUpTo} positions at price $${Number(currentPrice) / 1e8}`);

  for (let id = 0n; id < scanUpTo; id++) {
    try {
      const [leverage, isLong, isOpen, , marginHandle, sizeHandle, entryPriceHandle] =
        await getPosition(id);

      // cheap plaintext checks first — skip before spending decrypt cost
      if (!isOpen) continue;
      if (await isAlreadyLiquidated(id)) continue;

      // decrypt encrypted position values via KMS gateway
      const { margin, size, entryPrice } = await decryptPositionValues(
        marginHandle as `0x${string}`,
        sizeHandle as `0x${string}`,
        entryPriceHandle as `0x${string}`,
      );

      const underwater = isUndercollateralized(margin, size, entryPrice, currentPrice, isLong);

      if (underwater) {
        console.log(`[scan] position ${id} is underwater — liquidating`);
        await executeLiquidation(id, margin, size, entryPrice);
      }
    } catch (err) {
      // log and continue — don't let one bad position stop the scan
      console.error(`[scan] error on position ${id}:`, err);
    }
  }
}
