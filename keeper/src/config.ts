import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia as sepoliaFhe } from "@zama-fhe/sdk/chains";

const required = (key: string) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
};

export const KEEPER_PRIVATE_KEY = required("KEEPER_PRIVATE_KEY") as `0x${string}`;
export const RPC_URL             = required("SEPOLIA_RPC_URL");
export const PERP_ENGINE_ADDRESS         = required("PERP_ENGINE_ADDRESS") as `0x${string}`;
export const LIQUIDATION_ENGINE_ADDRESS  = required("LIQUIDATION_ENGINE_ADDRESS") as `0x${string}`;
export const ORACLE_ADDRESS = "0x694AA1769357215DE4FAC081bf1f309aDC325306" as `0x${string}`;
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15_000);
export const MAX_SCAN         = Number(process.env.MAX_SCAN ?? 500);

export const account = privateKeyToAccount(KEEPER_PRIVATE_KEY);

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

export const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});

const chain = { ...sepoliaFhe, network: RPC_URL } as const;

const config = createConfig({
  chains: [chain],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: node({ poolSize: 1 }) },
});

export const sdk = new ZamaSDK(config);
