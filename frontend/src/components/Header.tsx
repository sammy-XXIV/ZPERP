import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { useEthPrice } from "../hooks/useEthPrice";
import { WalletBalance } from "./WalletBalance";

export function Header() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { price } = useEthPrice();

  const wrongChain = isConnected && chainId !== sepolia.id;

  return (
    <header className="t-header">
      <div className="t-logo">ZPERP</div>

      <div className="t-market">
        <span className="t-pair">ETH / USD</span>
        <span className="t-price">
          {price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "——"}
        </span>
        {price && <span className="t-change up">PERP</span>}
      </div>

      <div className="t-meta">
        <div className="t-meta-item">
          <strong>{price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "——"}</strong>
          MARK PRICE
        </div>
        <div className="t-meta-item">
          <strong>5%</strong>
          MAINT MARGIN
        </div>
        <div className="t-meta-item">
          <strong>50×</strong>
          MAX LEV
        </div>
        <div className="t-meta-item">
          <strong>Sepolia</strong>
          NETWORK
        </div>
      </div>

      <div className="t-right">
        <WalletBalance />
        <span className="badge">FHE · ERC-7984</span>
        {wrongChain ? (
          <button
            className="wallet-btn"
            style={{ borderColor: "var(--red)", color: "var(--red)" }}
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isSwitching}
          >
            {isSwitching ? "Switching..." : "Wrong Network — Switch to Sepolia"}
          </button>
        ) : isConnected ? (
          <button className="wallet-btn connected" onClick={() => disconnect()}>
            <span className="dot" />
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </button>
        ) : (
          <button className="wallet-btn" onClick={() => connect({ connector: injected() })}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
