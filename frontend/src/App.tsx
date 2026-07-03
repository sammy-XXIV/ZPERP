import { Header } from "./components/Header";
import { TradePanel } from "./components/TradePanel";
import { PriceChart } from "./components/PriceChart";
import { OrderBook } from "./components/OrderBook";
import { PositionsTable } from "./components/PositionsTable";

export default function App() {
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
