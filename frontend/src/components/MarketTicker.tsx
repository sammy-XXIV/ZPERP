import { useEthPrice } from "../hooks/useEthPrice";

export function MarketTicker() {
  const { price, isLoading } = useEthPrice();

  return (
    <div className="ticker">
      <span className="ticker-pair">ETH / USD</span>

      <span className="ticker-price">
        {isLoading ? "——" : price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
      </span>

      <div className="ticker-meta">
        <span><strong>NETWORK</strong> Sepolia</span>
        <span><strong>ORACLE</strong> Chainlink</span>
        <span><strong>PRIVACY</strong> FHE · Zama</span>
      </div>
    </div>
  );
}
