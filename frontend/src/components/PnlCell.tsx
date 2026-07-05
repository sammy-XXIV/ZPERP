import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDecryptValues, useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { ADDRESSES } from "../wagmi";
import { useEthPrice } from "../hooks/useEthPrice";
import { useElapsed } from "../hooks/useElapsed";
import { REVEAL_MS } from "./EncryptedValue";

type Props = {
  sizeHandle: `0x${string}`;       // ETH quantity, 6 decimals
  entryPriceHandle: `0x${string}`; // USD, 8 decimals
  isLong: boolean;
};

// Decrypts size + entry in one KMS call and shows live unrealized PnL vs mark.
export function PnlCell({ sizeHandle, entryPriceHandle, isLong }: Props) {
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

  const { data, isLoading, isError } = useDecryptValues(
    [
      { encryptedValue: sizeHandle, contractAddress: ADDRESSES.engine },
      { encryptedValue: entryPriceHandle, contractAddress: ADDRESSES.engine },
    ],
    { enabled: go && isConnected && !!hasPermit }
  );
  const sec = useElapsed(isLoading);

  const queryClient = useQueryClient();
  const hasValues = data?.[sizeHandle] !== undefined && data?.[entryPriceHandle] !== undefined;

  function hide() {
    setGo(false);
    queryClient.removeQueries({
      predicate: (q) => {
        const key = JSON.stringify(q.queryKey);
        return key.includes(sizeHandle) || key.includes(entryPriceHandle);
      },
    });
  }

  // auto re-hide after REVEAL_MS, matching EncryptedValue behavior
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
      <button className="btn btn-ghost btn-sm" onClick={start} title="Decrypt to compute PnL">
        show
      </button>
    );
  }
  if (isGranting) return <span className="enc-loading"><span className="spinner" />SIGN...</span>;
  if (go && !hasPermit) return <button className="btn btn-ghost btn-sm" onClick={() => grantPermit([ADDRESSES.engine])}>authorize</button>;
  if (isLoading) return <span className="enc-loading"><span className="spinner" />{sec}s</span>;
  if (isError) return <span title="Decryption failed">ERR</span>;

  const sizeRaw = data?.[sizeHandle];
  const entryRaw = data?.[entryPriceHandle];
  if (sizeRaw === undefined || entryRaw === undefined || !mark) return <span>—</span>;

  const sizeEth = Number(sizeRaw) / 1e6;
  const entry = Number(entryRaw) / 1e8;
  const pnl = (mark - entry) * sizeEth * (isLong ? 1 : -1);
  const color = pnl >= 0 ? "var(--mint)" : "var(--red)";

  return (
    <span
      style={{ color, cursor: "pointer" }}
      onClick={hide}
      title="Click to re-encrypt (auto-hides after 30s)"
    >
      {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
