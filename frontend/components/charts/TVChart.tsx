"use client";

import { useEffect, useRef } from "react";

interface TVChartProps {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume?: number[];
  sma50?: (number | null)[];
  sma200?: (number | null)[];
  height?: number;
  ticker?: string;
  isDark?: boolean;
}

// ─── Technical indicator helpers ───────────────────────────────────────────
function computeRSI(closes: number[], period = 14): (number | null)[] {
  if (closes.length < period + 1) return closes.map(() => null);
  const out: (number | null)[] = new Array(period).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  out.push(100 - 100 / (1 + avgG / (avgL || 1e-10)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push(100 - 100 / (1 + avgG / (avgL || 1e-10)));
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(period - 1).fill(null);
  let val = values.slice(0, period).reduce((a, b) => a + b) / period;
  out.push(val);
  for (let i = period; i < values.length; i++) {
    val = values[i] * k + val * (1 - k);
    out.push(val);
  }
  return out;
}

function computeMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const e12 = ema(closes, fast);
  const e26 = ema(closes, slow);
  const macd = e12.map((v, i) => (v != null && e26[i] != null ? v - e26[i]! : null));
  const macdVals = macd.filter((v): v is number => v != null);
  const sigRaw = ema(macdVals, signal);
  const offset = macd.length - macdVals.length;
  const sigFull: (number | null)[] = [
    ...new Array(offset).fill(null),
    ...sigRaw,
  ];
  const hist = macd.map((v, i) => (v != null && sigFull[i] != null ? v - sigFull[i]! : null));
  return { macd, signal: sigFull, hist };
}

function computeBB(closes: number[], period = 20, mult = 2) {
  const upper: (number | null)[] = [], lower: (number | null)[] = [], mid: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); mid.push(null); continue; }
    const sl = closes.slice(i - period + 1, i + 1);
    const m = sl.reduce((a, b) => a + b) / period;
    const s = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    mid.push(m); upper.push(m + mult * s); lower.push(m - mult * s);
  }
  return { upper, lower, mid };
}

export default function TVChart({
  dates,
  open,
  high,
  low,
  close,
  volume,
  sma50,
  sma200,
  height = 400,
  ticker = "",
  isDark = true,
}: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || dates.length === 0) return;
    let cleanup: (() => void) | undefined;

    import("lightweight-charts").then((lc) => {
      const { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } = lc as any;
      if (!containerRef.current) return;

      // Theme tokens
      const bg      = isDark ? "#0D1117" : "#FFFFFF";
      const gridCol = isDark ? "#1F2937" : "#E5E7EB";
      const textCol = isDark ? "#9CA3AF" : "#4B5563";
      const borderC = isDark ? "#374151" : "#D1D5DB";
      const horzCross = isDark ? "#374151" : "#D1D5DB";

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: bg },
          textColor: textCol,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: gridCol },
          horzLines: { color: gridCol },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#F97316", labelBackgroundColor: "#F97316" },
          horzLine: { color: horzCross, labelBackgroundColor: horzCross },
        },
        rightPriceScale: {
          borderColor: borderC,
          scaleMargins: { top: 0.08, bottom: volume ? 0.28 : 0.05 },
        },
        timeScale: { borderColor: borderC, timeVisible: true, secondsVisible: false },
        handleScroll: true,
        handleScale: true,
      });

      // ─── Pane 0: Candlestick + SMA50/200 + Bollinger Bands ───
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22C55E", downColor: "#EF4444",
        borderUpColor: "#22C55E", borderDownColor: "#EF4444",
        wickUpColor: "#22C55E", wickDownColor: "#EF4444",
        title: ticker,
      });
      candleSeries.setData(dates.map((d, i) => ({ time: d, open: open[i], high: high[i], low: low[i], close: close[i] })));

      // Bollinger Bands
      const bb = computeBB(close);
      const bbStyle = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      const bbUpper = chart.addSeries(LineSeries, { ...bbStyle, color: isDark ? "rgba(148,163,184,0.4)" : "rgba(100,116,139,0.5)", title: "BB+" });
      const bbMid   = chart.addSeries(LineSeries, { ...bbStyle, color: isDark ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.3)", lineStyle: 2 });
      const bbLower = chart.addSeries(LineSeries, { ...bbStyle, color: isDark ? "rgba(148,163,184,0.4)" : "rgba(100,116,139,0.5)", title: "BB-" });
      bbUpper.setData(dates.map((d, i) => bb.upper[i] != null ? { time: d, value: bb.upper[i] } : null).filter(Boolean));
      bbMid.setData(dates.map((d, i)   => bb.mid[i]   != null ? { time: d, value: bb.mid[i]   } : null).filter(Boolean));
      bbLower.setData(dates.map((d, i) => bb.lower[i] != null ? { time: d, value: bb.lower[i] } : null).filter(Boolean));

      if (sma50) {
        const s = chart.addSeries(LineSeries, { color: "#F97316", lineWidth: 1, lineStyle: 2, title: "SMA50", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(dates.map((d, i) => sma50[i] != null ? { time: d, value: sma50[i] } : null).filter(Boolean));
      }
      if (sma200) {
        const s = chart.addSeries(LineSeries, { color: "#3B82F6", lineWidth: 1, lineStyle: 2, title: "SMA200", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(dates.map((d, i) => sma200[i] != null ? { time: d, value: sma200[i] } : null).filter(Boolean));
      }

      // ─── Pane 1: Volume ───
      if (volume) {
        const volS = chart.addSeries(HistogramSeries, { color: "rgba(59,130,246,0.25)", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, 1);
        volS.setData(dates.map((d, i) => ({ time: d, value: volume[i], color: close[i] >= open[i] ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)" })));
        chart.panes()[1]?.setHeight(60);
      }

      // ─── Pane 2: RSI ───
      const rsiPane = volume ? 2 : 1;
      const rsi = computeRSI(close);
      const rsiS = chart.addSeries(LineSeries, { color: "#A78BFA", lineWidth: 1.5, title: "RSI(14)", priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }, rsiPane);
      rsiS.setData(dates.map((d, i) => rsi[i] != null ? { time: d, value: rsi[i] } : null).filter(Boolean));
      // 30/70 reference lines
      const refStyle = { color: isDark ? "rgba(107,114,128,0.5)" : "rgba(156,163,175,0.6)", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      [70, 50, 30].forEach(level => {
        const l = chart.addSeries(LineSeries, { ...refStyle }, rsiPane);
        l.setData([{ time: dates[0], value: level }, { time: dates[dates.length - 1], value: level }]);
      });
      chart.panes()[rsiPane]?.setHeight(80);

      // ─── Pane 3: MACD ───
      const macdPane = rsiPane + 1;
      const { macd: macdLine, signal: macdSig, hist: macdHist } = computeMACD(close);
      const macdS = chart.addSeries(LineSeries, { color: "#60A5FA", lineWidth: 1.5, title: "MACD", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true }, macdPane);
      const sigS  = chart.addSeries(LineSeries, { color: "#F97316", lineWidth: 1, title: "Signal", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, macdPane);
      const histS = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: "Hist" }, macdPane);
      macdS.setData(dates.map((d, i) => macdLine[i] != null ? { time: d, value: macdLine[i] } : null).filter(Boolean));
      sigS.setData(dates.map((d, i) => macdSig[i] != null ? { time: d, value: macdSig[i] } : null).filter(Boolean));
      histS.setData(dates.map((d, i) => macdHist[i] != null ? { time: d, value: macdHist[i], color: macdHist[i]! >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)" } : null).filter(Boolean));
      chart.panes()[macdPane]?.setHeight(80);

      chart.timeScale().fitContent();

      const ro = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      ro.observe(containerRef.current);
      cleanup = () => { ro.disconnect(); chart.remove(); };
    });

    return () => cleanup?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length, ticker, height, isDark]);

  return <div ref={containerRef} style={{ height, width: "100%" }} className="overflow-hidden" />;
}
