import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL) },
});

// Contract addresses
export const ADDRESSES = {
  vault:             import.meta.env.VITE_VAULT_ADDRESS      as `0x${string}`,
  engine:            import.meta.env.VITE_ENGINE_ADDRESS     as `0x${string}`,
  liquidationEngine: import.meta.env.VITE_LIQ_ENGINE_ADDRESS as `0x${string}`,
  cUSDT:             "0x4E7B06D78965594eB5EF5414c357ca21E1554491" as `0x${string}`,
  usdt:              "0xa7da08fafdc9097cc0e7d4f113a61e31d7e8e9b0" as `0x${string}`, // mock underlying, open mint
  oracle:            "0x694AA1769357215DE4FAC081bf1f309aDC325306" as `0x${string}`,
} as const;
