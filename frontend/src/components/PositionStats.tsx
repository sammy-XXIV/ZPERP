import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDecryptValues, useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { ADDRESSES } from "../wagmi";
import { useEthPrice } from "../hooks/useEthPrice";
import { useElapsed } from "../hooks/useElapsed";
import { REVEAL_MS } from "./EncryptedValue";

type Props = {
  marginHandle: `0x${string}`;     // cUSDT, 6 decimals
  sizeHandle: `0x${string}`;       // ETH quantity, 6 decimals
  entryPriceHandle: `0x${string}`; // USD, 8 decimals
  isLong: boolean;
};

// One KMS decrypt of margin + size + entry powers both cells:
// live unrealized PnL and the owner's liquidation price.
// Renders two <td>s (PNL, LIQ PRICE).
export function PositionStats({ marginHandle, sizeHandle, entryPriceHandle, isLong }: Props) {
  const { isConnected } = useAccount();
  const { price: mark } = useEthPrice();
  const [go, setGo] = useState(false);

  const { data: hasPermit } = useHasPermit(
    { contractAddresses: [ADDRESSES.engine] },
    { enabled: isConnected }
  );
  const { mutate: grantPermit, isPending: isGranting } = useGrantPermit({
    onError: (e) => console.error("[grantPermit] failed:", e),
  });

  const handles = [marginHandle, sizeHandle, entryPriceHandle];
  const { data, isLoading, isError } = useDecryptValues(
    handles.map((h) => ({ encryptedValue: h, contractAddress: ADDRESSES.engine })),
    { enabled: go && isConnected && !!hasPermit }
  );
  const sec = useElapsed(isLoading);

  const queryClient = useQueryClient();
  const hasValues = handles.every((h) => data?.[h] !== undefined);

  function hide() {
    setGo(false);
    queryClient.removeQueries({
      predicate: (q) => {
        const key = JSON.stringify(q.queryKey);
        return handles.some((h) => key.includes(h));
      },
    });
  }

  useEffect(() => {
    if (!go || !hasValues) return;
    const t = setTimeout(hide, REVEAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, hasValues]);

  function start() {
    if (!hasPermit) grantPermit([ADDRESSES.engine]);
    setGo(true);
  }

  if (!go) {
    return (
      <>
        <td><button className="btn btn-ghost btn-sm" onClick={start} title="Decrypt to compute PnL and liq price">show</button></td>
        <td><button className="btn btn-ghost btn-sm" onClick={start} title="Decrypt to compute PnL and liq price">show</button></td>
      </>
    );
  }
  if (isGranting) return (<><td><span className="enc-loading"><span className="spinner" />SIGN...</span></td><td style={{ color: "var(--text-dim)" }}>——</td></>);
  if (go && !hasPermit) return (<><td><button className="btn btn-ghost btn-sm" onClick={() => grantPermit([ADDRESSES.engine])}>authorize</button></td><td style={{ color: "var(--text-dim)" }}>——</td></>);
  if (isLoading) return (<><td><span className="enc-loading"><span className="spinner" />{sec}s</span></td><td style={{ color: "var(--text-dim)" }}>——</td></>);
  if (isError || !hasValues || !mark) return (<><td title="Decryption failed">ERR</td><td style={{ color: "var(--text-dim)" }}>——</td></>);

  const margin = Number(data![marginHandle]) / 1e6;
  const sizeEth = Number(data![sizeHandle]) / 1e6;
  const entry = Number(data![entryPriceHandle]) / 1e8;

  const pnl = (mark - entry) * sizeEth * (isLong ? 1 : -1);
  const pnlColor = pnl >= 0 ? "var(--mint)" : "var(--red)";

  // liquidation when margin + pnl < 5% of notional (PositionMath):
  // long:  P = (E - margin/size) / 0.95     short: P = (E + margin/size) / 1.05
  const liq = sizeEth > 0
    ? (isLong ? (entry - margin / sizeEth) / 0.95 : (entry + margin / sizeEth) / 1.05)
    : 0;
  const liqText = liq > 0
    ? `$${liq.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";

  return (
    <>
      <td>
        <span style={{ color: pnlColor, cursor: "pointer" }} onClick={hide} title="Click to re-encrypt (auto-hides after 30s)">
          {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </td>
      <td>
        <span style={{ color: isLong ? "var(--red)" : "var(--mint)", cursor: "pointer" }} onClick={hide} title="Click to re-encrypt (auto-hides after 30s)">
          {liqText}
        </span>
      </td>
    </>
  );
}
