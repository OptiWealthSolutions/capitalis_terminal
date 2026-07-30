"use client";

import { Heart, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { PriceHistory, EquityFundamentals } from "@/lib/types";
import { formatNumber, formatLargeNumber } from "@/lib/utils";

type Period = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";
const PERIOD_LABELS: Record<Period, string> = {
  "1mo": "1M", "3mo": "3M", "6mo": "6M", "1y": "1Y", "2y": "2Y", "5y": "5Y",
};

interface Props {
  ticker: string;
  fund: EquityFundamentals | undefined;
  history: PriceHistory | undefined;
  currentPrice: number | undefined;
  dayChange: number | null;
  dayChangePct: number | null;
  period: Period;
  setPeriod: (p: Period) => void;
  onRefresh: () => void;
  isWatched: boolean;
  toggleWatchlist: () => void;
}

export default function EquityMobileHero({
  ticker, fund, history, currentPrice, dayChange, dayChangePct,
  period, setPeriod, onRefresh, isWatched, toggleWatchlist,
}: Props) {
  const up = (dayChangePct ?? 0) >= 0;
  const company = (fund?.longName as string | undefined) ?? (fund?.shortName as string | undefined) ?? ticker;

  // Build sparkline path from history
  const closes = (history?.close ?? []) as number[];
  const dates  = (history?.dates ?? []) as string[];
  const W = 360, H = 160, P = 8;
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 1;
  const range = max - min || 1;
  const points = closes.map((c, i) => {
    const x = P + (i / Math.max(1, closes.length - 1)) * (W - 2 * P);
    const y = P + (1 - (c - min) / range) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const sparkColor = up ? "var(--green)" : "var(--red)";

  // Stats
  const open    = (fund?.regularMarketOpen as number | undefined) ?? null;
  const high    = (fund?.regularMarketDayHigh as number | undefined) ?? null;
  const low     = (fund?.regularMarketDayLow as number | undefined) ?? null;
  const volume  = (fund?.regularMarketVolume as number | undefined) ?? null;
  const avgVol  = (fund?.averageDailyVolume3Month as number | undefined) ?? null;
  const mktCap  = (fund?.marketCap as number | undefined) ?? null;

  const formatTimestamp = () => {
    if (!dates.length) return "—";
    const d = dates[dates.length - 1];
    return d.slice(5).replace("-", "/");
  };

  return (
    <div className="md:hidden" style={{ display: "flex", flexDirection: "column", paddingBottom: 96 }}>

      {/* Top bar: back + title + heart */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
      }}>
        <Link href="/dashboard" aria-label="Back to dashboard" style={{ color: "var(--t1)", display: "flex" }}>
          <ArrowLeft size={20} strokeWidth={1.8} />
        </Link>
        <button
          onClick={toggleWatchlist}
          aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
        >
          <Heart size={20} fill={isWatched ? "var(--red)" : "none"} stroke={isWatched ? "var(--red)" : "var(--t2)"} strokeWidth={1.8} />
        </button>
      </div>

      {/* Hero: ticker name + price */}
      <div style={{ padding: "20px 16px 8px" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--t3)", letterSpacing: "0.04em", marginBottom: 6 }}>
          {company.length > 32 ? company.slice(0, 32) + "…" : company} ({ticker})
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="mono" style={{ fontSize: "2rem", fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            {currentPrice != null ? `$${formatNumber(currentPrice)}` : "—"}
          </span>
        </div>
        <p className="mono" style={{ fontSize: "0.82rem", color: up ? "var(--green)" : "var(--red)", marginTop: 6, fontWeight: 500 }}>
          {up ? "▲" : "▼"} {dayChangePct != null ? `${(dayChangePct * 100).toFixed(2)}%` : "—"}
          <span style={{ color: "var(--t3)", marginLeft: 8 }}>Past 24 hours</span>
        </p>
      </div>

      {/* Sparkline chart */}
      <div style={{ padding: "12px 16px 8px", overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor={sparkColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={sparkColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {closes.length > 0 && (
            <>
              <polyline
                points={`${P},${H} ${points} ${W - P},${H}`}
                fill="url(#sparkFill)" stroke="none"
              />
              <polyline points={points} fill="none" stroke={sparkColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
        </svg>
      </div>

      {/* Period pills */}
      <div style={{ display: "flex", gap: 6, padding: "4px 16px 16px", overflowX: "auto" }}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => {
          const active = period === p;
          return (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-label={`Set period ${PERIOD_LABELS[p]}`}
              style={{
                flex: "0 0 auto",
                padding: "8px 14px",
                fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.04em",
                background: active ? "var(--orange)" : "transparent",
                color: active ? "#FFFFFF" : "var(--t2)",
                border: `1px solid ${active ? "var(--orange)" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          );
        })}
        <button
          onClick={onRefresh}
          aria-label="Refresh"
          style={{
            flex: "0 0 auto", padding: "8px 12px",
            background: "transparent", color: "var(--t2)",
            border: "1px solid var(--border)", cursor: "pointer",
            display: "flex", alignItems: "center",
          }}
        >
          <RefreshCw size={13} strokeWidth={1.8} />
        </button>
      </div>

      {/* Market Statistics */}
      <div style={{ padding: "8px 16px" }}>
        <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--t1)", marginBottom: 10 }}>
          Market Statistics
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--border)" }}>
          <Stat label="Open"     value={open != null ? formatNumber(open) : "—"} />
          <Stat label="Volume"   value={volume != null ? formatLargeNumber(volume) : "—"} />
          <Stat label="High"     value={high != null ? formatNumber(high) : "—"} />
          <Stat label="Avg. Vol" value={avgVol != null ? formatLargeNumber(avgVol) : "—"} />
          <Stat label="Low"      value={low != null ? formatNumber(low) : "—"} />
          <Stat label="Mkt Cap"  value={mktCap != null ? formatLargeNumber(mktCap) : "—"} />
        </div>
        <p style={{ fontSize: "0.66rem", color: "var(--t3)", marginTop: 8 }}>
          Last update {formatTimestamp()}
        </p>
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: "fixed", bottom: 56, left: 0, right: 0, zIndex: 30,
        padding: "10px 16px",
        background: "var(--bg-base)", borderTop: "1px solid var(--border)",
      }}>
        <Link
          href={`/tracker?ticker=${encodeURIComponent(ticker)}`}
          aria-label={`Add ${ticker} to portfolio`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", padding: "14px 20px",
            background: "var(--orange)", color: "#FFFFFF",
            fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.04em",
            textDecoration: "none", textTransform: "uppercase",
          }}
        >
          Add {ticker} to portfolio
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 0", borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: "0.78rem", color: "var(--t2)" }}>{label}</span>
      <span className="mono" style={{ fontSize: "0.82rem", color: "var(--t1)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
