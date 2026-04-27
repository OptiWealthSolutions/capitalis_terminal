"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { get } from "@/lib/api";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { useTheme } from "@/lib/theme";
import {
  Newspaper, TrendingUp, TrendingDown, Activity,
  ExternalLink, Clock, RefreshCw, BarChart3, Gauge,
  Zap, DollarSign, Globe, AlertTriangle,
} from "lucide-react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SectorData {
  etf: string; sector: string; price: number;
  change_1d_pct: number; change_1m_pct: number;
  change_3m_pct: number; change_1y_pct: number;
  rsi_14: number; above_50ma: boolean; above_200ma: boolean;
  position_52w_pct: number; from_52w_high_pct: number; vol_ratio: number | null;
  spark_30d: number[]; spark_1y: number[]; dates_1y: string[];
}
interface NewsItem {
  title: string; publisher: string; link: string;
  published: number; tickers: string[]; thumbnail: string;
}
interface BreadthData {
  total: number; sectors_above_200ma: number; sectors_above_50ma: number;
  avg_rsi: number; bullish: number; bearish: number;
  fear_greed: number; fear_greed_label: string; yield_spread: number | null;
}
interface MacroItem {
  symbol: string; label: string; category: string;
  price: number; change_1d_pct: number; change_1w_pct: number;
  change_1m_pct: number; change_3m_pct: number; spark: number[];
}
interface MacroData {
  macro: MacroItem[]; curve_spread: number | null; inverted: boolean;
}

type SortKey = "change_1d_pct" | "change_1m_pct" | "change_3m_pct" | "change_1y_pct";
type RotPeriod = "3m" | "6m" | "1y";
type TabKey = "sectors" | "rotation" | "macro" | "news";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pctColor(v: number): string {
  return v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--t3)";
}
function fmtPct(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function fmtPrice(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100)  return v.toFixed(2);
  if (v >= 1)    return v.toFixed(3);
  return v.toFixed(4);
}
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000 - ts) / 60);
  if (diff < 60)   return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}
function fgColor(score: number): string {
  if (score < 25) return "var(--red)";
  if (score < 45) return "#E8A87C";
  if (score < 55) return "var(--t2)";
  if (score < 75) return "var(--orange)";
  return "var(--green)";
}

// ---------------------------------------------------------------------------
// Sparkline SVG
// ---------------------------------------------------------------------------
function Spark({ values, up, w = 64, h = 20 }: { values: number[]; up: boolean; w?: number; h?: number }) {
  if (!values?.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const rng = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / rng) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ opacity: 0.8 }}>
      <polyline fill="none" strokeWidth="1.2" stroke={up ? "var(--green)" : "var(--red)"} points={pts} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Fear & Greed Gauge
// ---------------------------------------------------------------------------
function FearGreedGauge({ score, label }: { score: number; label: string }) {
  const color = fgColor(score);
  const angle = -135 + (score / 100) * 270; // -135° to +135°
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Gauge size={13} style={{ color: "var(--orange)" }} />
        <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>
          Fear & Greed
        </span>
      </div>
      {/* Arc gauge */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <svg width={80} height={48} viewBox="0 0 80 48" style={{ overflow: "visible" }}>
          {/* Background arc */}
          <path d="M 8 44 A 32 32 0 0 1 72 44" fill="none" stroke="var(--bg-base)" strokeWidth="5" strokeLinecap="round" />
          {/* Colored arc — clip by score */}
          <path d="M 8 44 A 32 32 0 0 1 72 44" fill="none"
            stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 100.5} 100.5`} />
          {/* Needle */}
          <g transform={`translate(40, 44) rotate(${angle})`}>
            <line x1={0} y1={0} x2={0} y2={-26} stroke="var(--t2)" strokeWidth="1.5" strokeLinecap="round" />
            <circle r={2.5} fill="var(--t2)" />
          </g>
        </svg>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: -4 }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 700, color, fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
            {score.toFixed(0)}
          </span>
          <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>/100</span>
        </div>
        <span style={{ fontSize: "0.65rem", fontWeight: 600, color, letterSpacing: "0.04em" }}>{label}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sector Card
// ---------------------------------------------------------------------------
function SectorCard({ s, sortKey }: { s: SectorData; sortKey: SortKey }) {
  const d1up = s.change_1d_pct >= 0;
  const highlight = s[sortKey];
  const highlightUp = highlight >= 0;
  const pos52 = s.position_52w_pct ?? 50;
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "var(--r)", padding: "14px 16px",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-hi)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 2 }}>{s.etf}</div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)", lineHeight: 1.2 }}>{s.sector}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: highlightUp ? "var(--green)" : "var(--red)", fontFamily: "JetBrains Mono, monospace" }}>
            {fmtPct(highlight)}
          </span>
          {/* Volume badge */}
          {s.vol_ratio != null && (
            <div style={{
              fontSize: "0.52rem", fontWeight: 600, marginTop: 3, padding: "1px 5px", borderRadius: 3,
              background: s.vol_ratio > 1.5 ? "rgba(122,167,232,0.12)" : "rgba(127,127,127,0.08)",
              color: s.vol_ratio > 1.5 ? "var(--orange)" : "var(--t3)",
              border: `1px solid ${s.vol_ratio > 1.5 ? "var(--orange-border)" : "var(--border)"}`,
            }}>
              VOL {s.vol_ratio.toFixed(1)}x
            </div>
          )}
        </div>
      </div>

      {/* Price + sparkline */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", fontWeight: 600, color: "var(--t1)" }}>
            ${s.price.toFixed(2)}
          </span>
          {s.from_52w_high_pct != null && s.from_52w_high_pct < -0.5 && (
            <span style={{ fontSize: "0.58rem", color: "var(--t3)", marginLeft: 6, fontFamily: "JetBrains Mono, monospace" }}>
              {fmtPct(s.from_52w_high_pct, 1)} ATH
            </span>
          )}
        </div>
        <Spark values={s.spark_30d} up={d1up} />
      </div>

      {/* 4-period changes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
        {(["1D", "1M", "3M", "1Y"] as const).map((label, i) => {
          const vals = [s.change_1d_pct, s.change_1m_pct, s.change_3m_pct, s.change_1y_pct];
          const v = vals[i];
          return (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, color: pctColor(v), fontFamily: "JetBrains Mono, monospace" }}>
                {fmtPct(v, 1)}
              </div>
            </div>
          );
        })}
      </div>

      {/* 52-week position bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: "0.52rem", color: "var(--t3)" }}>52W LOW</span>
          <span style={{ fontSize: "0.52rem", color: "var(--t3)", fontFamily: "JetBrains Mono, monospace" }}>{pos52.toFixed(0)}%</span>
          <span style={{ fontSize: "0.52rem", color: "var(--t3)" }}>52W HIGH</span>
        </div>
        <div style={{ height: 3, background: "var(--bg-base)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pos52}%`, background: pos52 > 70 ? "var(--green)" : pos52 < 30 ? "var(--red)" : "var(--orange)", borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* MA + RSI signals */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {[
          { label: "200MA", ok: s.above_200ma },
          { label: "50MA",  ok: s.above_50ma },
        ].map(({ label, ok }) => (
          <span key={label} style={{
            fontSize: "0.57rem", fontWeight: 600, padding: "2px 5px", borderRadius: 3,
            background: ok ? "rgba(134,179,138,0.12)" : "rgba(212,133,133,0.1)",
            color: ok ? "var(--green)" : "var(--red)",
            border: `1px solid ${ok ? "rgba(134,179,138,0.25)" : "rgba(212,133,133,0.2)"}`,
          }}>
            {ok ? "▲" : "▼"} {label}
          </span>
        ))}
        <span style={{
          fontSize: "0.57rem", fontWeight: 600, padding: "2px 5px", borderRadius: 3,
          background: s.rsi_14 > 70 ? "rgba(212,133,133,0.1)" : s.rsi_14 < 30 ? "rgba(134,179,138,0.12)" : "rgba(127,127,127,0.1)",
          color: s.rsi_14 > 70 ? "var(--red)" : s.rsi_14 < 30 ? "var(--green)" : "var(--t2)",
          border: "1px solid rgba(127,127,127,0.2)",
        }}>
          RSI {s.rsi_14.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Macro Card
// ---------------------------------------------------------------------------
function MacroCard({ item }: { item: MacroItem }) {
  const up = item.change_1d_pct >= 0;
  const isVix = item.symbol === "^VIX";
  const vixUp = isVix ? !up : up; // for VIX, rising = bad
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "var(--r)", padding: "14px 16px",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-hi)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: "0.6rem", color: "var(--t3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>
            {item.category}
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)" }}>{item.label}</div>
        </div>
        <Spark values={item.spark} up={vixUp} w={52} h={18} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 700, color: "var(--t1)" }}>
          {item.symbol.includes("TNX") || item.symbol.includes("TYX") || item.symbol.includes("IRX")
            ? `${item.price.toFixed(2)}%`
            : `$${fmtPrice(item.price)}`
          }
        </span>
        <span style={{ marginLeft: 8, fontSize: "0.72rem", fontWeight: 600, color: isVix ? pctColor(-item.change_1d_pct) : pctColor(item.change_1d_pct), fontFamily: "JetBrains Mono, monospace" }}>
          {fmtPct(item.change_1d_pct)} 1D
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
        {([["1W", item.change_1w_pct], ["1M", item.change_1m_pct], ["3M", item.change_3m_pct]] as [string, number][]).map(([l, v]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.52rem", color: "var(--t3)", marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: "0.65rem", fontWeight: 600, color: isVix ? pctColor(-v) : pctColor(v), fontFamily: "JetBrains Mono, monospace" }}>
              {fmtPct(v, 1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// News Card
// ---------------------------------------------------------------------------
function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", textDecoration: "none", transition: "background 0.1s" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {item.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnail} alt="" style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--t1)", lineHeight: 1.4, marginBottom: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{item.publisher}</span>
          <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>·</span>
          <Clock size={9} style={{ color: "var(--t3)" }} />
          <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{timeAgo(item.published)}</span>
          {item.tickers.slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: "0.58rem", fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "var(--orange)", padding: "1px 5px", background: "var(--orange-dim)", borderRadius: 3 }}>
              {t}
            </span>
          ))}
          <ExternalLink size={9} style={{ color: "var(--t3)", marginLeft: "auto", flexShrink: 0 }} />
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Breadth KPI
// ---------------------------------------------------------------------------
function BreadthKpi({ label, value, total, icon }: { label: string; value: number; total: number; icon: React.ReactNode }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const good = pct >= 60;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: "var(--orange)" }}>{icon}</span>
        <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: "1.5rem", fontWeight: 700, color: good ? "var(--green)" : "var(--red)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ color: "var(--t3)", fontSize: "0.75rem" }}>/ {total}</span>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: good ? "var(--green)" : "var(--red)", marginLeft: 4 }}>({pct}%)</span>
      </div>
      <div style={{ marginTop: 8, height: 3, background: "var(--bg-base)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: good ? "var(--green)" : "var(--red)", borderRadius: 2, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MarketMapPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [tab, setTab]       = useState<TabKey>("sectors");
  const [sortKey, setSortKey] = useState<SortKey>("change_1d_pct");
  const [rotPeriod, setRotPeriod] = useState<RotPeriod>("1y");

  const { data: sectorData, isLoading: sectorLoading, refetch: refetchSectors } = useQuery<{ sectors: SectorData[] }>({
    queryKey: ["market-sectors"],
    queryFn:  () => get("/market/sectors"),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const { data: newsData, isLoading: newsLoading } = useQuery<{ news: NewsItem[] }>({
    queryKey: ["market-news"],
    queryFn:  () => get("/market/news"),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const { data: breadth, isLoading: breadthLoading } = useQuery<BreadthData>({
    queryKey: ["market-breadth"],
    queryFn:  () => get("/market/breadth"),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const { data: macroData, isLoading: macroLoading } = useQuery<MacroData>({
    queryKey: ["market-macro"],
    queryFn:  () => get("/market/macro"),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const sectors = sectorData?.sectors ?? [];
  const sortedSectors = useMemo(() =>
    [...sectors].sort((a, b) => b[sortKey] - a[sortKey]),
    [sectors, sortKey]
  );

  // Rotation chart — slice by period
  const periodSlice = useMemo(() => {
    const n = rotPeriod === "3m" ? 63 : rotPeriod === "6m" ? 126 : 9999;
    return n;
  }, [rotPeriod]);

  const COLORS = ["#7AA7E8","#86B38A","#C9B178","#D48585","#A97CC0","#5BBCB8","#E8A87C","#7CA8D4","#B5CC8E","#D4A5A5","#9E9EC0"];

  const rotationTraces = useMemo(() => {
    if (!sectors.length) return [];
    return sectors.map((s, i) => {
      const spark = s.spark_1y.slice(-periodSlice);
      const dates = s.dates_1y.slice(-periodSlice);
      const base  = spark[0] || 1;
      const norm  = spark.map(v => (v / base) * 100);
      return {
        type: "scatter" as const, mode: "lines" as const,
        x: dates, y: norm,
        name: s.etf,
        line: { color: COLORS[i % COLORS.length], width: 1.5 },
        hovertemplate: `%{x}<br>${s.sector}: %{y:.1f}<extra></extra>`,
      };
    });
  }, [sectors, periodSlice]);

  const plotLayout = useMemo(() => ({
    paper_bgcolor: "transparent",
    plot_bgcolor:  "transparent",
    font: { family: "Inter, sans-serif", color: isDark ? "#94A3B8" : "#64748B", size: 11 },
    margin: { l: 44, r: 20, t: 20, b: 40 },
    xaxis: { gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", zeroline: false },
    yaxis: { gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", zeroline: false },
    legend: { bgcolor: "transparent", font: { size: 10 }, orientation: "h" as const, y: -0.18 },
    hovermode: "x unified" as const,
  }), [isDark]);

  // Group macro items by category
  const macroByCategory = useMemo(() => {
    const m = macroData?.macro ?? [];
    const cats: Record<string, MacroItem[]> = {};
    for (const item of m) {
      if (!cats[item.category]) cats[item.category] = [];
      cats[item.category].push(item);
    }
    return cats;
  }, [macroData]);

  const catOrder = ["equity", "volatility", "rates", "currency", "commodities", "bonds", "crypto"];
  const catLabels: Record<string, string> = {
    equity: "Equity Indices", volatility: "Volatility", rates: "Interest Rates",
    currency: "Currency", commodities: "Commodities", bonds: "Fixed Income", crypto: "Crypto",
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: "sectors",  label: "Sector Heatmap" },
    { key: "rotation", label: "Rotation Chart" },
    { key: "macro",    label: "Macro Dashboard" },
    { key: "news",     label: "News Feed" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto fade-in">

      {/* Header */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 4 }}>
            Market Intelligence
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>Market Map</h1>
          <p style={{ color: "var(--t2)", fontSize: "0.82rem", marginTop: 4 }}>
            Sector rotation · Macro · News · Breadth · Fear & Greed
          </p>
        </div>
        <button
          onClick={() => { refetchSectors(); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--t2)", fontSize: "0.72rem" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── KPI Row ── */}
      {breadthLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24" />)}
        </div>
      ) : breadth ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <BreadthKpi label="Above 200MA" value={breadth.sectors_above_200ma} total={breadth.total} icon={<TrendingUp size={13} />} />
          <BreadthKpi label="Above 50MA"  value={breadth.sectors_above_50ma}  total={breadth.total} icon={<Activity size={13} />} />

          {/* Avg RSI */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Gauge size={13} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>Avg RSI</span>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: breadth.avg_rsi > 70 ? "var(--red)" : breadth.avg_rsi < 40 ? "var(--green)" : "var(--orange)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
              {breadth.avg_rsi}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--t3)", marginTop: 6 }}>
              {breadth.avg_rsi > 70 ? "Overbought" : breadth.avg_rsi < 40 ? "Oversold" : "Neutral"}
            </div>
          </div>

          {/* Bullish/Bearish trend */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <BarChart3 size={13} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>Sector Trend</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "var(--green)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", fontSize: "0.9rem" }}>{breadth.bullish}▲</span>
                <span style={{ color: "var(--red)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", fontSize: "0.9rem" }}>{breadth.bearish}▼</span>
              </div>
              <div style={{ flex: 1 }}>
                {[{ v: breadth.bullish, c: "var(--green)" }, { v: breadth.bearish, c: "var(--red)" }].map((row, i) => (
                  <div key={i} style={{ height: 6, background: "var(--bg-base)", borderRadius: 3, overflow: "hidden", marginBottom: i === 0 ? 4 : 0 }}>
                    <div style={{ height: "100%", width: `${(row.v / (breadth.total || 1)) * 100}%`, background: row.c, borderRadius: 3 }} />
                  </div>
                ))}
              </div>
            </div>
            {breadth.yield_spread != null && (
              <div style={{ marginTop: 8, fontSize: "0.6rem", color: breadth.yield_spread < 0 ? "var(--red)" : "var(--t3)" }}>
                {breadth.yield_spread < 0 ? <AlertTriangle size={9} style={{ display: "inline", marginRight: 3 }} /> : null}
                10Y-3M spread: {breadth.yield_spread.toFixed(2)}%
                {breadth.yield_spread < 0 ? " (inverted)" : ""}
              </div>
            )}
          </div>

          {/* Fear & Greed */}
          {breadth.fear_greed != null
            ? <FearGreedGauge score={breadth.fear_greed} label={breadth.fear_greed_label} />
            : <SkeletonBlock className="h-24" />
          }
        </div>
      ) : null}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "6px 14px", borderRadius: "var(--r-sm)", border: "1px solid",
            fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s",
            background:  tab === key ? "var(--orange-dim)" : "var(--bg-hover)",
            borderColor: tab === key ? "var(--orange-border)" : "var(--border)",
            color:       tab === key ? "var(--orange)" : "var(--t2)",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Sector Heatmap ── */}
      {tab === "sectors" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.62rem", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sort by:</span>
            {(["change_1d_pct", "change_1m_pct", "change_3m_pct", "change_1y_pct"] as SortKey[]).map((k, i) => (
              <button key={k} onClick={() => setSortKey(k)} style={{
                padding: "3px 10px", borderRadius: 4, border: "1px solid",
                fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
                background: sortKey === k ? "var(--orange-dim)" : "var(--bg-hover)",
                borderColor: sortKey === k ? "var(--orange-border)" : "var(--border)",
                color: sortKey === k ? "var(--orange)" : "var(--t3)",
              }}>
                {["1D", "1M", "3M", "1Y"][i]}
              </button>
            ))}
            {/* Risk-On/Off indicator */}
            {sectors.length > 0 && (() => {
              const riskOn  = sectors.filter(s => ["XLK","XLY","XLF"].includes(s.etf));
              const riskOff = sectors.filter(s => ["XLP","XLU","XLV"].includes(s.etf));
              const onAvg   = riskOn.length  ? riskOn.reduce((a, s)  => a + s.change_1m_pct, 0) / riskOn.length  : 0;
              const offAvg  = riskOff.length ? riskOff.reduce((a, s) => a + s.change_1m_pct, 0) / riskOff.length : 0;
              const spread  = onAvg - offAvg;
              return (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "0.6rem", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Risk Mode</span>
                  <span style={{
                    fontSize: "0.65rem", fontWeight: 700, padding: "3px 10px", borderRadius: 4,
                    background: spread > 0 ? "rgba(134,179,138,0.12)" : "rgba(212,133,133,0.1)",
                    color: spread > 0 ? "var(--green)" : "var(--red)",
                    border: `1px solid ${spread > 0 ? "rgba(134,179,138,0.25)" : "rgba(212,133,133,0.2)"}`,
                    fontFamily: "JetBrains Mono, monospace",
                  }}>
                    {spread > 0 ? "RISK ON" : "RISK OFF"} {Math.abs(spread).toFixed(1)}%
                  </span>
                </div>
              );
            })()}
          </div>

          {sectorLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 11 }).map((_, i) => <SkeletonBlock key={i} className="h-52" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {sortedSectors.map(s => <SectorCard key={s.etf} s={s} sortKey={sortKey} />)}
            </div>
          )}
        </>
      )}

      {/* ── Rotation Chart ── */}
      {tab === "rotation" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "20px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>
                Sector Rotation (normalized to 100)
              </span>
              <p style={{ fontSize: "0.68rem", color: "var(--t3)", marginTop: 3 }}>
                Relative performance of SPDR ETFs. Diverging lines = rotation in progress.
              </p>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["3m", "6m", "1y"] as RotPeriod[]).map(p => (
                <button key={p} onClick={() => setRotPeriod(p)} style={{
                  padding: "3px 10px", borderRadius: 4, border: "1px solid",
                  fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
                  background: rotPeriod === p ? "var(--orange-dim)" : "var(--bg-hover)",
                  borderColor: rotPeriod === p ? "var(--orange-border)" : "var(--border)",
                  color: rotPeriod === p ? "var(--orange)" : "var(--t3)",
                }}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {sectorLoading ? <SkeletonBlock className="h-96" /> : rotationTraces.length > 0 ? (
            <Plot
              data={rotationTraces}
              layout={{ ...plotLayout, height: 400 }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          ) : (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>No data</div>
          )}

          {/* Summary table */}
          {sectors.length > 0 && (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Sector","ETF","Price","1D","1M","3M","1Y","RSI","52W%","200MA","50MA"].map(h => (
                      <th key={h} style={{ paddingBottom: 8, paddingRight: 10, textAlign: h === "Sector" || h === "ETF" ? "left" : "right", color: "var(--t3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.58rem" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...sectors].sort((a, b) => b.change_1y_pct - a.change_1y_pct).map(s => (
                    <tr key={s.etf} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 10px 7px 0", color: "var(--t1)", fontWeight: 600 }}>{s.sector}</td>
                      <td style={{ paddingRight: 10, color: "var(--orange)", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{s.etf}</td>
                      <td style={{ paddingRight: 10, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "var(--t1)" }}>${s.price.toFixed(2)}</td>
                      {[s.change_1d_pct, s.change_1m_pct, s.change_3m_pct, s.change_1y_pct].map((v, i) => (
                        <td key={i} style={{ paddingRight: 10, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: pctColor(v), fontWeight: 600 }}>{fmtPct(v, 1)}</td>
                      ))}
                      <td style={{ paddingRight: 10, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: s.rsi_14 > 70 ? "var(--red)" : s.rsi_14 < 30 ? "var(--green)" : "var(--t2)" }}>{s.rsi_14.toFixed(0)}</td>
                      <td style={{ paddingRight: 10, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: (s.position_52w_pct ?? 50) > 70 ? "var(--green)" : (s.position_52w_pct ?? 50) < 30 ? "var(--red)" : "var(--t2)" }}>{(s.position_52w_pct ?? 0).toFixed(0)}%</td>
                      <td style={{ paddingRight: 10, textAlign: "right", color: s.above_200ma ? "var(--green)" : "var(--red)" }}>{s.above_200ma ? "▲" : "▼"}</td>
                      <td style={{ textAlign: "right", color: s.above_50ma ? "var(--green)" : "var(--red)" }}>{s.above_50ma ? "▲" : "▼"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Macro Dashboard ── */}
      {tab === "macro" && (
        <div>
          {/* Yield curve alert */}
          {macroData?.inverted && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 16, background: "rgba(212,133,133,0.08)", border: "1px solid rgba(212,133,133,0.25)", borderRadius: "var(--r)" }}>
              <AlertTriangle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />
              <span style={{ fontSize: "0.75rem", color: "var(--red)", fontWeight: 500 }}>
                Yield curve inverted (10Y−3M: {macroData.curve_spread?.toFixed(2)}%) — historically a recession precursor
              </span>
            </div>
          )}

          {macroLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="space-y-6">
              {catOrder.filter(cat => macroByCategory[cat]?.length).map(cat => (
                <div key={cat}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>
                      {catLabels[cat] ?? cat}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                    {macroByCategory[cat].map(item => (
                      <MacroCard key={item.symbol} item={item} />
                    ))}
                    {/* Yield curve card in rates section */}
                    {cat === "rates" && macroData?.curve_spread != null && (
                      <div style={{ background: "var(--bg-card)", border: `1px solid ${macroData.inverted ? "rgba(212,133,133,0.3)" : "var(--border)"}`, borderRadius: "var(--r)", padding: "14px 16px" }}>
                        <div style={{ fontSize: "0.6rem", color: "var(--t3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>rates</div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)", marginBottom: 10 }}>Yield Curve</div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: macroData.inverted ? "var(--red)" : "var(--green)" }}>
                          {macroData.curve_spread > 0 ? "+" : ""}{macroData.curve_spread.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: "0.65rem", color: macroData.inverted ? "var(--red)" : "var(--t3)", marginTop: 6, fontWeight: macroData.inverted ? 600 : 400 }}>
                          10Y − 3M spread · {macroData.inverted ? "INVERTED ⚠" : "Normal"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── News Feed ── */}
      {tab === "news" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* News list */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Newspaper size={13} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>Market News</span>
              {newsLoading && <LoadingSpinner size="sm" />}
            </div>
            {newsLoading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-16" />)}</div>
            ) : (
              <div>
                {(newsData?.news ?? []).map((item, i) => <NewsCard key={i} item={item} />)}
                {!newsData?.news?.length && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: "0.78rem" }}>No news available.</div>
                )}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Top sectors today */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={13} style={{ color: "var(--green)" }} />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>Top Sectors Today</span>
              </div>
              {sectorLoading ? <SkeletonBlock className="h-48 m-3" /> : (
                <div>
                  {[...sectors].sort((a, b) => b.change_1d_pct - a.change_1d_pct).map((s, i) => (
                    <div key={s.etf} style={{ display: "flex", alignItems: "center", padding: "7px 16px", borderBottom: i < sectors.length - 1 ? "1px solid var(--border)" : "none", gap: 10 }}>
                      <span style={{ minWidth: 36, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "0.72rem", color: "var(--orange)" }}>{s.etf}</span>
                      <span style={{ flex: 1, fontSize: "0.72rem", color: "var(--t2)" }}>{s.sector}</span>
                      <Spark values={s.spark_30d} up={s.change_1d_pct >= 0} w={44} h={14} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", fontWeight: 600, color: pctColor(s.change_1d_pct), minWidth: 52, textAlign: "right" }}>
                        {fmtPct(s.change_1d_pct)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Smart Money Flow */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Zap size={13} style={{ color: "var(--orange)" }} />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>Smart Money Flow (1M vs 3M)</span>
              </div>
              <p style={{ fontSize: "0.65rem", color: "var(--t3)", marginBottom: 12, lineHeight: 1.5 }}>
                1M return exceeding 3M average signals institutional inflows. Divergence = active rotation.
              </p>
              {sectorLoading ? <SkeletonBlock className="h-40" /> : (
                <div className="space-y-1.5">
                  {[...sectors].sort((a, b) => (b.change_1m_pct - b.change_3m_pct / 3) - (a.change_1m_pct - a.change_3m_pct / 3)).map(s => {
                    const flow = s.change_1m_pct - s.change_3m_pct / 3;
                    return (
                      <div key={s.etf} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ minWidth: 36, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "0.68rem", color: "var(--orange)" }}>{s.etf}</span>
                        <div style={{ flex: 1, height: 5, background: "var(--bg-base)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, Math.abs(flow) * 5)}%`, background: flow > 0 ? "var(--green)" : "var(--red)", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: "0.65rem", fontWeight: 600, color: flow > 0 ? "var(--green)" : "var(--red)", minWidth: 50, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                          {flow > 0 ? "▲" : "▼"} {Math.abs(flow).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Worst laggards */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingDown size={13} style={{ color: "var(--red)" }} />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>Laggards (1M)</span>
              </div>
              {sectorLoading ? <SkeletonBlock className="h-32 m-3" /> : (
                <div>
                  {[...sectors].sort((a, b) => a.change_1m_pct - b.change_1m_pct).slice(0, 5).map((s, i) => (
                    <div key={s.etf} style={{ display: "flex", alignItems: "center", padding: "7px 16px", borderBottom: i < 4 ? "1px solid var(--border)" : "none", gap: 10 }}>
                      <span style={{ minWidth: 36, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "0.72rem", color: "var(--orange)" }}>{s.etf}</span>
                      <span style={{ flex: 1, fontSize: "0.72rem", color: "var(--t2)" }}>{s.sector}</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", fontWeight: 600, color: pctColor(s.change_1m_pct) }}>
                        {fmtPct(s.change_1m_pct, 1)} 1M
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
