import "dotenv/config";
import { sdk, publicClient, account } from "./config.js";
import { parseAbi } from "viem";

const CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491" as `0x${string}`;

async function main() {
  const handle = await publicClient.readContract({
    address: CUSDT,
    abi: parseAbi(["function confidentialBalanceOf(address) view returns (bytes32)"]),
    functionName: "confidentialBalanceOf",
    args: [account.address],
  });
  await sdk.permits.grantPermit([CUSDT]);
  const v = await sdk.decryption.decryptValues([
    { encryptedValue: handle as `0x${string}`, contractAddress: CUSDT },
  ]);
  console.log(`wallet cUSDT balance: ${Number(v[handle as `0x${string}`]) / 1e6}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
