import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { TradePanel } from "./components/TradePanel";
import { PriceChart } from "./components/PriceChart";
import { OrderBook } from "./components/OrderBook";
import { PositionsTable } from "./components/PositionsTable";
import { Landing } from "./components/Landing";

// hash routing keeps the SPA deploy simple: "/" is the landing page,
// "#/trade" is the terminal
function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const route = useRoute();

  if (!route.startsWith("#/trade")) {
    return <Landing />;
  }

  return (
    <div className="terminal">
      <Header />
      <TradePanel />
      <div className="t-chart"><PriceChart /></div>
      <OrderBook />
      <PositionsTable />
    </div>
  );
}
