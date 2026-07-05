import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia as sepoliaFhe } from "@zama-fhe/sdk/chains";
import { PERP_ENGINE_ABI } from "./abis.js";

// Proves the privacy model on a live position:
//   1. an arbitrary outsider wallet asks the KMS to decrypt position #0 -> must be DENIED (ACL)
//   2. the position owner's ACL-allowed wallet asks              -> must SUCCEED
// Run: npx tsx src/privacyCheck.ts

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://sepolia.drpc.org";
const ENGINE = (process.env.PERP_ENGINE_ADDRESS ?? "0xF07a3979f6D222b58b2081530F07347d0f79be5c") as `0x${string}`;
const POSITION_ID = BigInt(process.env.POSITION_ID ?? "0");

function makeSdk(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
  const chain = { ...sepoliaFhe, network: RPC_URL } as const;
  const config = createConfig({
    chains: [chain],
    publicClient,
    walletClient,
    relayers: { [sepolia.id]: node({ poolSize: 1 }) },
  });
  return { sdk: new ZamaSDK(config), address: account.address, publicClient };
}

async function tryDecrypt(sdk: ZamaSDK, handles: `0x${string}`[]) {
  await sdk.permits.grantPermit([ENGINE]);
  const inputs = handles.map((h) => ({ encryptedValue: h, contractAddress: ENGINE }));
  return await sdk.decryption.decryptValues(inputs);
}

async function main() {
  const outsiderKey = generatePrivateKey();
  const outsider = makeSdk(outsiderKey);
  const owner = makeSdk(process.env.KEEPER_PRIVATE_KEY as `0x${string}`);

  const [, , isOpen, posOwner, margin, size, entryPrice] = await owner.publicClient.readContract({
    address: ENGINE,
    abi: PERP_ENGINE_ABI,
    functionName: "getPosition",
    args: [POSITION_ID],
  });
  console.log(`position #${POSITION_ID}: open=${isOpen} owner=${posOwner}`);
  console.log(`handles on-chain (all anyone can see):`);
  console.log(`  margin: ${margin}`);
  console.log(`  size:   ${size}`);
  console.log(`  entry:  ${entryPrice}`);
  const handles = [margin, size, entryPrice] as `0x${string}`[];

  console.log(`\n[1/2] outsider ${outsider.address} (random wallet, no ACL) requests decryption...`);
  let outsiderDenied = false;
  try {
    const v = await tryDecrypt(outsider.sdk, handles);
    console.log("  UNEXPECTED: KMS returned values to an outsider:", v);
  } catch (e) {
    outsiderDenied = true;
    console.log(`  DENIED by KMS: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
  }

  console.log(`\n[2/2] ACL-allowed wallet ${owner.address} requests decryption...`);
  let ownerOk = false;
  try {
    const v = await tryDecrypt(owner.sdk, handles);
    ownerOk = true;
    console.log(`  margin: ${v[handles[0]]}  size: ${v[handles[1]]}  entry: ${v[handles[2]]}`);
  } catch (e) {
    console.log(`  UNEXPECTED failure: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
  }

  console.log(`\nresult: outsider denied = ${outsiderDenied}, allowed wallet succeeded = ${ownerOk}`);
  console.log(outsiderDenied && ownerOk ? "PRIVACY CHECK PASSED" : "PRIVACY CHECK FAILED");
  process.exit(outsiderDenied && ownerOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
