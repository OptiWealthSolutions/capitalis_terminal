"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface MetricTooltipProps {
  label: string;
  tip:   string;
  dotted?: boolean;
}

export default function MetricTooltip({ label, tip, dotted = false }: MetricTooltipProps) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const show = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ x: r.left + r.width / 2, y: r.top });
  }, []);

  const hide = useCallback(() => setCoords(null), []);

  useEffect(() => {
    if (!coords) return;
    const dismiss = () => setCoords(null);
    document.addEventListener("click", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("click", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [coords]);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center gap-1"
      style={{ cursor: "help" }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span
        style={dotted ? {
          borderBottom: "1px dotted rgba(245,245,245,0.32)",
          paddingBottom: 1,
        } : undefined}
      >
        {label}
      </span>
      {!dotted && (
        <Info size={11} style={{ color: "rgba(245,245,245,0.28)", flexShrink: 0 }} />
      )}

      {mounted && coords && createPortal(
        <span
          style={{
            position: "fixed",
            left: coords.x,
            top: coords.y - 8,
            transform: "translateX(-50%) translateY(-100%)",
            zIndex: 99999,
            width: 220,
            padding: "8px 10px",
            background: "var(--bg-pop, #1e2130)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontSize: "0.72rem",
            lineHeight: 1.5,
            color: "var(--t2)",
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            pointerEvents: "none",
            whiteSpace: "normal",
            textAlign: "left",
          }}
        >
          <span style={{
            position: "absolute",
            bottom: -5,
            left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            width: 8,
            height: 8,
            background: "var(--bg-pop, #1e2130)",
            borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }} />
          {tip}
        </span>,
        document.body
      )}
    </span>
  );
}

// ── Metric tone types ─────────────────────────────────────────────────────────
export type MetricTone = "pos" | "warn" | "neg" | undefined;

// ── Small colored dot for metric rows ────────────────────────────────────────
export function ToneDot({ tone }: { tone: MetricTone }) {
  if (!tone) return null;
  const color = tone === "pos" ? "var(--green)" : tone === "warn" ? "var(--yellow, #c9b178)" : "var(--red)";
  return (
    <span
      title={tone === "pos" ? "Above benchmark" : tone === "warn" ? "Near benchmark" : "Below benchmark"}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        marginLeft: 6,
        opacity: 0.85,
      }}
    />
  );
}

// ── Hardcoded benchmark tone calculator ──────────────────────────────────────
export const METRIC_TIPS: Record<string, string> = {
  "Sharpe Ratio":       "Return per unit of risk. Higher = better. Ideal > 1. Below 0 = losing money vs risk-free rate.",
  "Sharpe":             "Return per unit of risk. Higher = better. Ideal > 1. Below 0 = losing money vs risk-free rate.",
  "Max Drawdown":       "Worst peak-to-trough decline. Smaller absolute value = better. Measures downside risk.",
  "PEG Ratio":          "P/E divided by earnings growth rate. < 1 = potentially undervalued. > 2 = expensive relative to growth.",
  "P/E (TTM)":          "Price-to-Earnings: how much you pay for $1 of profit. < 15 = cheap, 15–25 = fair, > 35 = expensive.",
  "Trailing P/E":       "Price-to-Earnings on trailing 12 months earnings. < 15 = cheap, > 35 = expensive.",
  "Forward P/E":        "P/E using next-year earnings estimate. Lower = cheaper relative to expected growth.",
  "ROE":                "Return on Equity: profit as % of shareholder equity. > 15% = good. > 25% = exceptional.",
  "ROA":                "Return on Assets: profit as % of total assets. > 5% = solid. Banks typically 1–2%.",
  "Gross Margin":       "Revenue minus COGS as % of revenue. Higher = more pricing power. SaaS often > 70%.",
  "Operating Margin":   "Operating profit as % of revenue. > 15% = strong. Varies heavily by sector.",
  "Net Margin":         "Bottom-line profit as % of revenue. > 10% = healthy. Banks and retailers are lower.",
  "EBITDA Margin":      "Earnings before interest/taxes/depreciation as % of revenue. Proxy for operating efficiency.",
  "Price / Book":       "Market cap vs book value. < 1 = potentially undervalued (or struggling). > 5 = growth premium.",
  "Price / Sales":      "Market cap vs revenue. < 1 = cheap, 1–3 = fair for most sectors, > 10 = high growth priced in.",
  "EV / EBITDA":        "Enterprise value vs EBITDA. < 10 = cheap, 10–15 = fair, > 20 = expensive.",
  "Beta":               "Sensitivity to market moves. 1 = moves with market. > 1.5 = volatile. < 0.5 = defensive.",
  "Ann. Return (5Y)":   "Annualised total return over last 5 years including dividends.",
  "Ann. Volatility":    "Annualised standard deviation of daily returns. Higher = more risk.",
  "CAGR (5Y)":          "Compound Annual Growth Rate over 5 years. The 'true' annualised return.",
  "VaR 95% (1Y)":       "Value at Risk: estimated maximum loss in 95% of scenarios over 1 year. Not a worst-case.",
  "CVaR 95% (1Y)":      "Conditional VaR: average loss in the worst 5% of scenarios. Worse than VaR by definition.",
  "Debt / Equity":      "Total debt vs equity. < 0.5 = low leverage. > 2 = highly leveraged (context-dependent).",
  "Current Ratio":      "Current assets vs current liabilities. > 2 = strong liquidity. < 1 = potential cash crunch.",
};

export function getMetricTone(label: string, rawValue: number | undefined | null): MetricTone {
  if (rawValue == null) return undefined;
  const map: Record<string, (v: number) => MetricTone> = {
    returnOnEquity:     v => v > 0.20 ? "pos" : v > 0.05 ? "warn" : "neg",
    returnOnAssets:     v => v > 0.10 ? "pos" : v > 0.02 ? "warn" : "neg",
    grossMargins:       v => v > 0.50 ? "pos" : v > 0.20 ? "warn" : "neg",
    operatingMargins:   v => v > 0.15 ? "pos" : v > 0.05 ? "warn" : "neg",
    profitMargins:      v => v > 0.10 ? "pos" : v > 0.03 ? "warn" : "neg",
    ebitdaMargins:      v => v > 0.20 ? "pos" : v > 0.08 ? "warn" : "neg",
    trailingPE:         v => v > 0 && v < 20 ? "pos" : v < 35 ? "warn" : "neg",
    forwardPE:          v => v > 0 && v < 18 ? "pos" : v < 30 ? "warn" : "neg",
    priceToBook:        v => v > 0 && v < 3  ? "pos" : v < 8  ? "warn" : "neg",
    priceToSalesTrailing12Months: v => v > 0 && v < 2 ? "pos" : v < 6 ? "warn" : "neg",
    enterpriseToEbitda: v => v > 0 && v < 12 ? "pos" : v < 20 ? "warn" : "neg",
    pegRatio:           v => v > 0 && v < 1  ? "pos" : v < 2  ? "warn" : "neg",
    beta:               v => v > 0 && v < 1.2 ? "pos" : v < 1.8 ? "warn" : "neg",
    currentRatio:       v => v > 2   ? "pos" : v > 1   ? "warn" : "neg",
    quickRatio:         v => v > 1.5 ? "pos" : v > 0.8 ? "warn" : "neg",
    debtToEquity:       v => v < 0.5 ? "pos" : v < 1.5 ? "warn" : "neg",
    sharpeRatio:        v => v > 1   ? "pos" : v > 0   ? "warn" : "neg",
    annReturn:          v => v > 0.10 ? "pos" : v > 0   ? "warn" : "neg",
    maxDrawdown:        v => v > -0.20 ? "pos" : v > -0.40 ? "warn" : "neg",
    cagr:               v => v > 0.08 ? "pos" : v > 0   ? "warn" : "neg",
  };
  const fn = map[label];
  return fn ? fn(rawValue) : undefined;
}
