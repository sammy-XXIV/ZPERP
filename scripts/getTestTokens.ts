import { ethers } from "hardhat";

// Mints mock USDT (open mint) and wraps it into cUSDT (ERC-7984, rate 1:1).
// Run: npx hardhat run scripts/getTestTokens.ts --network sepolia
const USDT  = "0xa7da08fafdc9097cc0e7d4f113a61e31d7e8e9b0"; // Tether USD (Mock)
const CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491"; // Confidential USDT wrapper
const AMOUNT = 10_000n * 10n ** 6n; // 10,000 USDT (6 decimals)

const USDT_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const CUSDT_ABI = [
  "function wrap(address to, uint256 amount)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Wallet:", signer.address);

  const usdt  = new ethers.Contract(USDT, USDT_ABI, signer);
  const cusdt = new ethers.Contract(CUSDT, CUSDT_ABI, signer);

  const balance: bigint = await usdt.balanceOf(signer.address);
  if (balance < AMOUNT) {
    console.log(`1/3 minting ${AMOUNT / 10n ** 6n} USDT...`);
    await (await usdt.mint(signer.address, AMOUNT)).wait();
  } else {
    console.log(`1/3 already have ${balance / 10n ** 6n} USDT — skipping mint`);
  }

  const allowance: bigint = await usdt.allowance(signer.address, CUSDT);
  if (allowance < AMOUNT) {
    console.log("2/3 approving wrapper...");
    await (await usdt.approve(CUSDT, AMOUNT)).wait();
  } else {
    console.log("2/3 allowance already sufficient — skipping approve");
  }

  console.log("3/3 wrapping into cUSDT...");
  await (await cusdt.wrap(signer.address, AMOUNT)).wait();

  const handle = await cusdt.confidentialBalanceOf(signer.address);
  console.log("done. encrypted cUSDT balance handle:", handle);
  console.log("(actual amount is encrypted — decrypt via the app or KMS)");
}

main().catch((e) => { console.error(e); process.exit(1); });
