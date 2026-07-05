import "dotenv/config";
import { sdk, publicClient, walletClient, account } from "./config.js";
import { parseAbi } from "viem";

// One-off: withdraw the full vault margin back to the wallet.
// Usage: AMOUNT6=21686247 npx tsx src/withdrawVault.ts
const VAULT = (process.env.VAULT_ADDRESS ?? "0x9B4FA284EAfA4e582237EBa48892Efa70e6BF69A") as `0x${string}`;
const AMOUNT6 = BigInt(process.env.AMOUNT6 ?? "21686247");

const VAULT_ABI = parseAbi([
  "function withdraw(bytes32 encryptedAmount, bytes inputProof)",
  "function marginOf(address) view returns (bytes32)",
]);

async function main() {
  console.log(`withdrawing ${Number(AMOUNT6) / 1e6} cUSDT from vault ${VAULT}`);

  const { encryptedValues, inputProof } = await sdk.encrypt({
    values: [{ value: AMOUNT6, type: "euint64" }],
    contractAddress: VAULT,
    userAddress: account.address,
  });
  console.log("encrypted input ready");

  const hash = await walletClient.writeContract({
    address: VAULT,
    abi: VAULT_ABI,
    functionName: "withdraw",
    args: [encryptedValues[0], inputProof],
    gas: 3_000_000n,
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`withdraw tx: ${receipt.transactionHash} status: ${receipt.status}`);

  const marginHandle = await publicClient.readContract({
    address: VAULT, abi: VAULT_ABI, functionName: "marginOf", args: [account.address],
  });
  await sdk.permits.grantPermit([VAULT]);
  const v = await sdk.decryption.decryptValues([
    { encryptedValue: marginHandle as `0x${string}`, contractAddress: VAULT },
  ]);
  console.log(`vault margin after: ${Number(v[marginHandle as `0x${string}`]) / 1e6} cUSDT`);
}

main().catch((e) => { console.error(e); process.exit(1); });
