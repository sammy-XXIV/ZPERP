import {
  publicClient,
  walletClient,
  sdk,
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

async function readLiqFlag(fn: "liquidated" | "pendingLiquidation", id: bigint): Promise<boolean> {
  return await publicClient.readContract({
    address: LIQUIDATION_ENGINE_ADDRESS,
    abi: LIQUIDATION_ENGINE_ABI,
    functionName: fn,
    args: [id],
  });
}

// Trustless flow: flag on-chain (reveals handles), fetch KMS-signed public
// decryption, execute with the proof — the contract verifies the signatures.
async function liquidate(
  positionId: bigint,
  handles: [`0x${string}`, `0x${string}`, `0x${string}`],
  alreadyPending: boolean,
) {
  if (!alreadyPending) {
    console.log(`[liquidate] requesting liquidation of position ${positionId}`);
    const reqHash = await walletClient.writeContract({
      address: LIQUIDATION_ENGINE_ADDRESS,
      abi: LIQUIDATION_ENGINE_ABI,
      functionName: "requestLiquidation",
      args: [positionId],
      gas: 2_000_000n,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: reqHash });
  }

  console.log(`[liquidate] fetching KMS public decryption + proof`);
  const { abiEncodedClearValues, decryptionProof } =
    await sdk.decryption.decryptPublicValues([...handles]);

  console.log(`[liquidate] executing with on-chain proof verification`);
  const hash = await walletClient.writeContract({
    address: LIQUIDATION_ENGINE_ADDRESS,
    abi: LIQUIDATION_ENGINE_ABI,
    functionName: "executeLiquidation",
    args: [positionId, abiEncodedClearValues, decryptionProof],
    gas: 5_000_000n,
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
      const [, isLong, isOpen, , marginHandle, sizeHandle, entryPriceHandle] =
        await getPosition(id);

      // cheap plaintext checks first — skip before spending decrypt cost
      if (!isOpen) continue;
      if (await readLiqFlag("liquidated", id)) continue;

      const pending = await readLiqFlag("pendingLiquidation", id);

      // pre-check health via the keeper's private ACL decryption so healthy
      // positions are never flagged (their values stay confidential)
      const { margin, size, entryPrice } = await decryptPositionValues(
        marginHandle, sizeHandle, entryPriceHandle,
      );

      const underwater = isUndercollateralized(margin, size, entryPrice, currentPrice, isLong);

      if (underwater || pending) {
        console.log(`[scan] position ${id} is ${underwater ? "underwater" : "already flagged"} — liquidating`);
        await liquidate(id, [marginHandle, sizeHandle, entryPriceHandle], pending);
      }
    } catch (err) {
      // log and continue — don't let one bad position stop the scan
      console.error(`[scan] error on position ${id}:`, err);
    }
  }
}
