import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis" },
  optimizeDeps: {
    exclude: ["@zama-fhe/sdk", "@zama-fhe/react-sdk"],
  },
  server: {
    proxy: {
      "/binance-api": {
        target: "https://api.binance.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-api/, ""),
      },
      "/binance-ws": {
        target: "wss://stream.binance.com:9443",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-ws/, ""),
      },
    },
  },
});
