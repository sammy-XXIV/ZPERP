import "dotenv/config";
import { sdk, publicClient, account, PERP_ENGINE_ADDRESS } from "./config.js";
import { PERP_ENGINE_ABI } from "./abis.js";
import { parseAbi } from "viem";

// One-off: verify close settled PnL into vault margin for the keeper wallet.
const VAULT = "0x9B4FA284EAfA4e582237EBa48892Efa70e6BF69A" as `0x${string}`;

async function main() {
  const [, , isOpen] = await publicClient.readContract({
    address: PERP_ENGINE_ADDRESS,
    abi: PERP_ENGINE_ABI,
    functionName: "getPosition",
    args: [0n],
  });
  console.log("position #0 open:", isOpen);

  const marginHandle = await publicClient.readContract({
    address: VAULT,
    abi: parseAbi(["function marginOf(address) view returns (bytes32)"]),
    functionName: "marginOf",
    args: [account.address],
  });
  console.log("vault margin handle:", marginHandle);

  await sdk.permits.grantPermit([VAULT]);
  const values = await sdk.decryption.decryptValues([
    { encryptedValue: marginHandle as `0x${string}`, contractAddress: VAULT },
  ]);
  const raw = values[marginHandle as `0x${string}`];
  console.log("vault margin decrypted:", raw, `= ${Number(raw) / 1e6} cUSDT`);
}

main().catch((e) => { console.error(e); process.exit(1); });
