import { sdk, PERP_ENGINE_ADDRESS } from "./config.js";

export interface DecryptedPosition {
  margin:     bigint;
  size:       bigint;
  entryPrice: bigint;
}

// Decrypt the three encrypted position handles.
// The keeper wallet must have ACL permission (granted via FHE.allow in PerpEngine)
// and a permit covering the engine (granted at startup in index.ts).
export async function decryptPositionValues(
  marginHandle:     string,
  sizeHandle:       string,
  entryPriceHandle: string,
): Promise<DecryptedPosition> {
  // decryptValues takes { encryptedValue, contractAddress } inputs and returns
  // a record keyed by handle (per Zama SDK docs) — not a .clearValues wrapper
  const inputs = [marginHandle, sizeHandle, entryPriceHandle].map((h) => ({
    encryptedValue: h as `0x${string}`,
    contractAddress: PERP_ENGINE_ADDRESS,
  }));

  const values = await sdk.decryption.decryptValues(inputs);

  return {
    margin:     BigInt(values[marginHandle as `0x${string}`]     ?? 0),
    size:       BigInt(values[sizeHandle as `0x${string}`]       ?? 0),
    entryPrice: BigInt(values[entryPriceHandle as `0x${string}`] ?? 0),
  };
}
