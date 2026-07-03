import { useAccount, useBalance, useReadContract } from "wagmi";
import { CUSDT_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";
import { EncryptedValue } from "./EncryptedValue";

const ZERO_HANDLE = ("0x" + "0".repeat(64)) as `0x${string}`;

export function WalletBalance() {
  const { address, isConnected } = useAccount();

  const { data: ethBal } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const { data: cusdtHandle } = useReadContract({
    address: ADDRESSES.cUSDT,
    abi: CUSDT_ABI,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  if (!isConnected) return null;

  const hasBalance = cusdtHandle && cusdtHandle !== ZERO_HANDLE;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "4px 12px",
      border: "1px solid rgba(200,255,0,0.15)",
      borderRadius: 3,
      background: "rgba(200,255,0,0.03)",
      fontFamily: "'Martian Mono', monospace",
      fontSize: "0.58rem",
      whiteSpace: "nowrap",
    }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ color: "var(--text-dim)", fontSize: "0.48rem", letterSpacing: "0.08em" }}>GAS</span>
        <span style={{ color: "var(--text-primary)" }}>
          {ethBal ? `${Number(ethBal.formatted).toFixed(4)} ETH` : "—"}
        </span>
      </span>

      <span style={{ width: 1, height: 20, background: "rgba(200,255,0,0.12)" }} />

      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ color: "var(--text-dim)", fontSize: "0.48rem", letterSpacing: "0.08em" }}>cUSDT</span>
        <span style={{ color: "var(--text-primary)" }}>
          {hasBalance ? (
            <EncryptedValue handle={cusdtHandle as `0x${string}`} decimals={6} contract={ADDRESSES.cUSDT} />
          ) : (
            "0.00"
          )}
        </span>
      </span>
    </div>
  );
}
