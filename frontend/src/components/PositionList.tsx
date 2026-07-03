import { useAccount, useWriteContract } from "wagmi";
import { useUserPositions } from "../hooks/usePositions";
import { EncryptedValue } from "./EncryptedValue";
import { ENGINE_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";

export function PositionList() {
  const { address } = useAccount();
  const { positions } = useUserPositions(address);
  const { writeContract } = useWriteContract();

  function closePosition(id: bigint) {
    writeContract({
      address: ADDRESSES.engine,
      abi: ENGINE_ABI,
      functionName: "closePosition",
      args: [id],
    });
  }

  return (
    <div className="card">
      <div className="card-title">Your Positions</div>

      {positions.length === 0 ? (
        <div className="empty-state">
          NO OPEN POSITIONS<br />
          <span style={{ color: "var(--text-dim)", marginTop: 8, display: "block" }}>
            Position data is encrypted on-chain
          </span>
        </div>
      ) : (
        positions.map((pos) => (
          <div key={pos.id.toString()} className={`position-card ${pos.isLong ? "long" : "short"}`}>
            <div className="position-header">
              <span className="position-id">POS #{pos.id.toString()}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`position-direction ${pos.isLong ? "long" : "short"}`}>
                  {pos.isLong ? "LONG" : "SHORT"} {pos.leverage}×
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => closePosition(pos.id)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="position-grid">
              <div className="position-stat">
                <label>Margin</label>
                <div className="val">
                  <EncryptedValue handle={pos.marginHandle} decimals={6} />
                </div>
              </div>
              <div className="position-stat">
                <label>Size</label>
                <div className="val">
                  <EncryptedValue handle={pos.sizeHandle} decimals={6} />
                </div>
              </div>
              <div className="position-stat">
                <label>Entry Price</label>
                <div className="val">
                  <EncryptedValue
                    handle={pos.entryPriceHandle}
                    decimals={8}
                    format={(raw) => `$${(Number(raw) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
