import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { wagmiConfig } from "./wagmi";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const zamaConfig = createZamaConfig({
  chains: [sepolia],
  wagmiConfig,
  relayers: { [sepolia.id]: web() },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <App />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
