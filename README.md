# ZPERP — Confidential Perpetual DEX on Zama fhEVM

A perpetual futures exchange where position sizes, margins, entry prices, and PnL are encrypted on-chain using Zama's fhEVM. Built for the Zama Developer Program Season 3.

Live on Sepolia. Margin is confidential USDT (ERC-7984); the market is ETH/USD priced by Chainlink.

## What is confidential

- Margin, position size, and entry price are stored as `euint64` — visible to no one except the position owner (via KMS decryption) and the permissioned liquidation keeper
- PnL settlement happens fully homomorphically on-chain: `payout = margin +/- size * |mark - entry|` computed with `FHE.select`/`FHE.mul` — the payout amount is never revealed
- Deposits and withdrawals move confidential ERC-7984 tokens; amounts are encrypted client-side with ZK input proofs

What stays public: position direction, leverage, open/closed status, and the existence of transactions.

## Architecture

| Component | Description |
|---|---|
| `contracts/PerpVault.sol` | Custody of cUSDT margin. Locks margin for positions, pulling any shortfall straight from the trader's wallet (one-step open, homomorphic `min`) |
| `contracts/PerpEngine.sol` | Opens/closes positions, encrypted PnL settlement against Chainlink ETH/USD |
| `contracts/LiquidationEngine.sol` | Permissioned keeper flow: keeper decrypts position values via the Zama KMS (ACL-granted), verifies health off-chain, executes liquidation on-chain with oracle-verified price |
| `keeper/` | TypeScript liquidation bot — scans positions, decrypts via `@zama-fhe/sdk`, liquidates undercollateralized positions |
| `frontend/` | React + wagmi + `@zama-fhe/react-sdk` trading terminal with client-side encryption and KMS decryption |

## Deployed contracts (Sepolia)

| Contract | Address |
|---|---|
| PerpVault | `0x0951B4BD8fE822d3f4449A072584F441c4856f06` |
| PerpEngine | `0xc7C3c24677a018Be718E6cF56615A1Ade225Cb75` |
| LiquidationEngine | `0xb691c42b9cc6b28b89436E9Da1C767c52085c3F7` |
| cUSDT (ERC-7984) | `0x4E7B06D78965594eB5EF5414c357ca21E1554491` |
| Chainlink ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |

## Running it

Prerequisites: Node 20+, a Sepolia wallet with ETH for gas.

```bash
# contracts
npm install
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY
npx hardhat deploy --network sepolia

# frontend
cd frontend
npm install
cp .env.example .env
npm run dev            # http://localhost:5173

# keeper
cd keeper
npm install
cp .env.example .env   # fill in KEEPER_PRIVATE_KEY
npm run dev
```

## Demo flow

1. Connect wallet (Sepolia) — the in-app faucet mints mock USDT and wraps it to cUSDT
2. Approve cUSDT (one-time operator approval for the vault)
3. Open a long or short — margin and size are encrypted in the browser, one ZK proof covers both
4. Position appears with redacted values; decrypt via the Zama KMS to reveal your own numbers
5. PNL column computes live unrealized PnL after a single decrypt
6. Close — encrypted PnL settles on-chain into your vault margin; withdraw to your wallet
7. Open a 50x position to watch the keeper liquidate it (margin ratio 2% < 5% maintenance)

## Testnet simplifications

- Profit is paid from the vault's pooled balance — no LP/funding-rate mechanism
- The liquidation keeper's decrypted values are trusted (attestation); production would verify KMS decryption proofs on-chain
- Insurance fund is a plain address
