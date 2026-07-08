import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useUserPositions } from "../hooks/usePositions";
import { useEthPrice } from "../hooks/useEthPrice";
import { EncryptedValue } from "./EncryptedValue";
import { PositionStats } from "./PositionStats";
import { ENGINE_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";

type Tab = "positions" | "orders";

export function PositionsTable() {
  const [tab, setTab] = useState<Tab>("positions");
  const { address } = useAccount();
  const { positions } = useUserPositions(address);
  const { price: markPrice } = useEthPrice();
  const queryClient = useQueryClient();
  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // refetch handles as soon as a close confirms so the table never shows stale state
  useEffect(() => {
    if (!isConfirmed) return;
    queryClient.invalidateQueries({
      predicate: (q) => ["readContract", "readContracts", "balance"].includes(q.queryKey[0] as string),
    });
  }, [isConfirmed, queryClient]);

  function closePosition(id: bigint) {
    writeContract({
      address: ADDRESSES.engine, abi: ENGINE_ABI, functionName: "closePosition", args: [id],
      gas: 3_000_000n, // explicit — MetaMask over-estimates FHE ops and the RPC rejects the tx
    });
  }

  return (
    <div className="t-positions">
      <div className="pos-tabs">
        <button className={`pos-tab ${tab === "positions" ? "active" : ""}`} onClick={() => setTab("positions")}>
          Positions ({positions.length})
        </button>
        <button className={`pos-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          Open Orders (0)
        </button>
      </div>

      <div className="pos-table">
        {tab === "positions" && (
          positions.length === 0 ? (
            <div className="pos-empty">NO OPEN POSITIONS · Position details encrypted on-chain via FHE</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CONTRACT</th>
                  <th>DIRECTION</th>
                  <th>LEVERAGE</th>
                  <th>MARGIN</th>
                  <th>SIZE (ETH)</th>
                  <th>ENTRY PRICE</th>
                  <th>MARK PRICE</th>
                  <th>PNL</th>
                  <th>LIQ PRICE</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr key={pos.id.toString()}>
                    <td style={{ color: "var(--text-primary)" }}>ETH/USD #{pos.id.toString()}</td>
                    <td><span className={`dir-badge ${pos.isLong ? "long" : "short"}`}>{pos.isLong ? "LONG" : "SHORT"}</span></td>
                    <td>{pos.leverage}×</td>
                    <td><EncryptedValue handle={pos.marginHandle} decimals={6} /></td>
                    <td><EncryptedValue handle={pos.sizeHandle} decimals={6} /></td>
                    <td><EncryptedValue handle={pos.entryPriceHandle} decimals={8} format={(r) => `$${(Number(r)/1e8).toFixed(2)}`} /></td>
                    <td style={{ color: "var(--text-primary)" }}>
                      {markPrice ? `$${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "——"}
                    </td>
                    <PositionStats
                      marginHandle={pos.marginHandle}
                      sizeHandle={pos.sizeHandle}
                      entryPriceHandle={pos.entryPriceHandle}
                      isLong={pos.isLong}
                    />
                    <td>
                      <button className="btn-sm" onClick={() => closePosition(pos.id)}>Close</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === "orders" && (
          <div className="pos-empty">NO OPEN ORDERS</div>
        )}
      </div>
    </div>
  );
}
