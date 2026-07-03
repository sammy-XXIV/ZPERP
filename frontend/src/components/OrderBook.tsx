import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { fetchRoundHistory, OracleRound } from "../lib/oracle";
import { ENGINE_ABI, LIQUIDATION_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";

// Oracle-priced perp — there is no order book. This panel shows the real
// Chainlink round feed (what fills actually execute against) + protocol stats.
export function OrderBook() {
  const [rounds, setRounds] = useState<OracleRound[]>([]);

  const { data: totalPositions } = useReadContract({
    address: ADDRESSES.engine,
    abi: ENGINE_ABI,
    functionName: "nextPositionId",
    query: { refetchInterval: 30_000 },
  });

  const { data: totalLiquidations } = useReadContract({
    address: ADDRESSES.liquidationEngine,
    abi: LIQUIDATION_ABI,
    functionName: "totalLiquidations",
    query: { refetchInterval: 30_000 },
  });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchRoundHistory(21)
        .then((r) => { if (!cancelled) setRounds(r.slice().reverse()); }) // newest first
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const latest = rounds[0];

  return (
    <div className="t-book">
      <div className="book-header">
        <span>ORACLE FEED</span>
        <span style={{ color: "var(--text-dim)" }}>CHAINLINK</span>
      </div>
      <div className="book-cols">
        <span>PRICE (USD)</span>
        <span style={{ textAlign: "right" }}>TIME</span>
      </div>

      <div className="book-rows">
        {rounds.slice(1).map((r, i) => {
          const next = rounds[i]; // newer round (list is newest-first)
          const up = next ? next.price >= r.price : true;
          return (
            <div key={r.roundId.toString()} className={`book-row ${up ? "bid" : "ask"}`}>
              <span className="price">
                {r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="size">
                {new Date(r.updatedAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        {rounds.length === 0 && (
          <div className="book-row"><span className="price" style={{ color: "var(--text-dim)" }}>loading rounds…</span></div>
        )}
      </div>

      <div className="book-spread">
        <span>
          {latest
            ? `$${latest.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "——"}
        </span>
        <span>ORACLE</span>
      </div>

      <div className="book-cols" style={{ marginTop: 4 }}>
        <span>POSITIONS OPENED</span>
        <span style={{ textAlign: "right" }}>{totalPositions !== undefined ? totalPositions.toString() : "—"}</span>
      </div>
      <div className="book-cols">
        <span>LIQUIDATIONS</span>
        <span style={{ textAlign: "right" }}>{totalLiquidations !== undefined ? totalLiquidations.toString() : "—"}</span>
      </div>
    </div>
  );
}
