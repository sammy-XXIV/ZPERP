import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, CandlestickSeries, IChartApi, ISeriesApi } from "lightweight-charts";
import { fetchRoundHistory, fetchLatestRound, buildCandles, TF, TF_SECONDS, Candle } from "../lib/oracle";

const TIMEFRAMES: TF[] = ["1h", "4h", "1d"];

export function PriceChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const [activeTf, setActiveTf] = useState<TF>("1h");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background:  { type: ColorType.Solid, color: "#0A0B08" },
        textColor:   "#3A4030",
        fontFamily:  "'Martian Mono', monospace",
        fontSize:    10,
      },
      grid: {
        vertLines: { color: "rgba(30,33,25,0.8)" },
        horzLines: { color: "rgba(30,33,25,0.8)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(200,255,0,0.3)", labelBackgroundColor: "#C8FF00" },
        horzLine: { color: "rgba(200,255,0,0.3)", labelBackgroundColor: "#C8FF00" },
      },
      rightPriceScale: { borderColor: "#1E2119", textColor: "#3A4030" },
      timeScale:       { borderColor: "#1E2119", timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00E676", downColor: "#FF3B3B",
      borderUpColor: "#00E676", borderDownColor: "#FF3B3B",
      wickUpColor:   "#00E676", wickDownColor:   "#FF3B3B",
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  // load real oracle history when tf changes, then poll for new rounds
  useEffect(() => {
    const series = seriesRef.current;
    const chart  = chartRef.current;
    if (!series || !chart) return;

    let cancelled = false;
    setStatus("loading");

    const loadHistory = async (fit: boolean) => {
      const rounds = await fetchRoundHistory(240);
      if (cancelled) return;
      const candles = buildCandles(rounds, TF_SECONDS[activeTf]);
      series.setData(candles as any);
      lastCandleRef.current = candles.at(-1) ?? null;
      if (fit) chart.timeScale().fitContent();
      setStatus("ready");
    };

    loadHistory(true).catch(() => { if (!cancelled) setStatus("error"); });

    const timer = setInterval(async () => {
      try {
        const round = await fetchLatestRound();
        if (cancelled) return;
        const tfSec = TF_SECONDS[activeTf];
        const slot = Math.floor(round.updatedAt / tfSec) * tfSec;
        const last = lastCandleRef.current;

        if (last && last.time === slot) {
          // same candle slot — merge the new round in
          const candle: Candle = {
            ...last,
            high:  Math.max(last.high, round.price),
            low:   Math.min(last.low, round.price),
            close: round.price,
          };
          lastCandleRef.current = candle;
          seriesRef.current?.update(candle as any);
        } else {
          // new slot (or the tab sat idle and missed rounds) — refetch real
          // history rather than fabricating a candle from a stale close
          await loadHistory(false);
        }
      } catch { /* transient RPC error — next poll retries */ }
    }, 60_000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [activeTf]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* timeframe strip */}
      <div style={{
        position: "absolute", top: 8, left: 12, zIndex: 10,
        display: "flex", gap: 2, alignItems: "center",
      }}>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setActiveTf(tf)}
            style={{
              background:  activeTf === tf ? "rgba(200,255,0,0.12)" : "transparent",
              border:      activeTf === tf ? "1px solid rgba(200,255,0,0.5)" : "1px solid transparent",
              color:       activeTf === tf ? "#C8FF00" : "#3A4030",
              fontFamily:  "'Martian Mono', monospace",
              fontSize:    10,
              padding:     "2px 7px",
              cursor:      "pointer",
              borderRadius: 2,
              letterSpacing: "0.05em",
              transition:  "all 0.15s",
            }}
          >
            {tf.toUpperCase()}
          </button>
        ))}
        <span style={{ fontSize: 9, color: "#3A4030", marginLeft: 8, letterSpacing: "0.05em" }}>
          {status === "loading" ? "LOADING CHAINLINK ROUNDS…" : status === "error" ? "ORACLE UNREACHABLE" : "CHAINLINK ETH/USD · SEPOLIA"}
        </span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
