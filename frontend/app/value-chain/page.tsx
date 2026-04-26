"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { get } from "@/lib/api";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { useTheme } from "@/lib/theme";
import {
  Map, Newspaper, TrendingUp, TrendingDown, Activity,
  ExternalLink, Clock, RefreshCw, BarChart3, Gauge,
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
  spark_30d: number[]; spark_1y: number[]; dates_1y: string[];
}
interface NewsItem {
  title: string; publisher: string; link: string;
  published: number; tickers: string[]; thumbnail: string;
}
interface BreadthData {
  total: number; sectors_above_200ma: number; sectors_above_50ma: number;
  avg_rsi: number; bullish: number; bearish: number;
}

type SortKey = "change_1d_pct" | "change_1m_pct" | "change_3m_pct" | "change_1y_pct";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pctColor(v: number): string {
  return v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--t3)";
}
function fmtPct(v: number, digits = 2): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000 - ts) / 60);
  if (diff < 60)  return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
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
// Sector Card
// ---------------------------------------------------------------------------
function SectorCard({ s, sortKey }: { s: SectorData; sortKey: SortKey }) {
  const d1up = s.change_1d_pct >= 0;
  const highlight = s[sortKey];
  const highlightUp = highlight >= 0;
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
          <div style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 2 }}>
            {s.etf}
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)", lineHeight: 1.2 }}>
            {s.sector}
          </div>
        </div>
        <span style={{
          fontSize: "0.72rem", fontWeight: 700,
          color: highlightUp ? "var(--green)" : "var(--red)",
          fontFamily: "JetBrains Mono, monospace",
        }}>
          {fmtPct(highlight)}
        </span>
      </div>

      {/* Price + 1D */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", fontWeight: 600, color: "var(--t1)" }}>
          ${s.price.toFixed(2)}
        </span>
        <Spark values={s.spark_30d} up={d1up} />
      </div>

      {/* 4-period bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
        {(["1D", "1M", "3M", "1Y"] as const).map((label, i) => {
          const vals: number[] = [s.change_1d_pct, s.change_1m_pct, s.change_3m_pct, s.change_1y_pct];
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

      {/* Signals */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: "0.58rem", fontWeight: 600, padding: "2px 6px", borderRadius: 3,
          background: s.above_200ma ? "rgba(134,179,138,0.12)" : "rgba(212,133,133,0.1)",
          color: s.above_200ma ? "var(--green)" : "var(--red)",
          border: `1px solid ${s.above_200ma ? "rgba(134,179,138,0.25)" : "rgba(212,133,133,0.2)"}`,
        }}>
          {s.above_200ma ? "▲" : "▼"} 200MA
        </span>
        <span style={{
          fontSize: "0.58rem", fontWeight: 600, padding: "2px 6px", borderRadius: 3,
          background: s.above_50ma ? "rgba(134,179,138,0.12)" : "rgba(212,133,133,0.1)",
          color: s.above_50ma ? "var(--green)" : "var(--red)",
          border: `1px solid ${s.above_50ma ? "rgba(134,179,138,0.25)" : "rgba(212,133,133,0.2)"}`,
        }}>
          {s.above_50ma ? "▲" : "▼"} 50MA
        </span>
        <span style={{
          fontSize: "0.58rem", fontWeight: 600, padding: "2px 6px", borderRadius: 3,
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
// News Card
// ---------------------------------------------------------------------------
function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex", gap: 12, padding: "12px 16px",
        borderBottom: "1px solid var(--border)", textDecoration: "none",
        transition: "background 0.1s",
      }}
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
        <span style={{ fontSize: "1.6rem", fontWeight: 700, color: good ? "var(--green)" : "var(--red)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ color: "var(--t3)", fontSize: "0.75rem" }}>/ {total}</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: good ? "var(--green)" : "var(--red)", marginLeft: 4 }}>
          ({pct}%)
        </span>
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
  const [tab, setTab] = useState<"sectors" | "rotation" | "news">("sectors");
  const [sortKey, setSortKey] = useState<SortKey>("change_1d_pct");

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

  const sectors = sectorData?.sectors ?? [];
  const sortedSectors = useMemo(() =>
    [...sectors].sort((a, b) => b[sortKey] - a[sortKey]),
    [sectors, sortKey]
  );

  // Rotation chart data — each sector normalized to 100 at year start
  const rotationTraces = useMemo(() => {
    if (!sectors.length) return [];
    return sectors.map((s, i) => {
      const base = s.spark_1y[0] || 1;
      const normalized = s.spark_1y.map(v => (v / base) * 100);
      const COLORS = ["#7AA7E8","#86B38A","#C9B178","#D48585","#A97CC0","#5BBCB8","#E8A87C","#7CA8D4","#B5CC8E","#D4A5A5","#9E9EC0"];
      return {
        type: "scatter" as const, mode: "lines" as const,
        x: s.dates_1y, y: normalized,
        name: s.sector,
        line: { color: COLORS[i % COLORS.length], width: 1.5 },
        hovertemplate: `%{x}<br>${s.sector}: %{y:.1f}<extra></extra>`,
      };
    });
  }, [sectors]);

  const plotLayout = useMemo(() => ({
    paper_bgcolor: "transparent",
    plot_bgcolor:  "transparent",
    font: { family: "Inter, sans-serif", color: isDark ? "#94A3B8" : "#64748B", size: 11 },
    margin: { l: 44, r: 20, t: 20, b: 40 },
    xaxis: { gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", zeroline: false },
    yaxis: { gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", zeroline: false, ticksuffix: "" },
    legend: { bgcolor: "transparent", font: { size: 10 }, orientation: "h" as const, y: -0.15 },
    hovermode: "x unified" as const,
  }), [isDark]);

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
            Sector rotation · News · Breadth · Positioning
          </p>
        </div>
        <button
          onClick={() => refetchSectors()}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--t2)", fontSize: "0.72rem" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Breadth KPIs */}
      {breadthLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-20" />)}
        </div>
      ) : breadth ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <BreadthKpi label="Above 200-day MA" value={breadth.sectors_above_200ma} total={breadth.total} icon={<TrendingUp size={13} />} />
          <BreadthKpi label="Above 50-day MA"  value={breadth.sectors_above_50ma}  total={breadth.total} icon={<Activity size={13} />} />
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Gauge size={13} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>Avg Sector RSI</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: breadth.avg_rsi > 70 ? "var(--red)" : breadth.avg_rsi < 40 ? "var(--green)" : "var(--orange)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
              {breadth.avg_rsi}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--t3)", marginTop: 6 }}>
              {breadth.avg_rsi > 70 ? "Overbought" : breadth.avg_rsi < 40 ? "Oversold" : "Neutral"}
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <BarChart3 size={13} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>Trend</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--green)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{breadth.bullish}▲</span>
              <span style={{ color: "var(--t3)" }}>/</span>
              <span style={{ color: "var(--red)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{breadth.bearish}▼</span>
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--t3)", marginTop: 6 }}>Bullish / Bearish sectors</div>
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["sectors", "rotation", "news"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 14px", borderRadius: "var(--r-sm)", border: "1px solid",
              fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s",
              background:   tab === t ? "var(--orange-dim)" : "var(--bg-hover)",
              borderColor:  tab === t ? "var(--orange-border)" : "var(--border)",
              color:        tab === t ? "var(--orange)" : "var(--t2)",
            }}
          >
            {t === "sectors" ? "Sector Heatmap" : t === "rotation" ? "Rotation Chart" : "News Feed"}
          </button>
        ))}
      </div>

      {/* ── Sector Heatmap ── */}
      {tab === "sectors" && (
        <>
          {/* Sort controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: "0.62rem", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sort by:</span>
            {(["change_1d_pct", "change_1m_pct", "change_3m_pct", "change_1y_pct"] as SortKey[]).map((k, i) => {
              const labels = ["1D", "1M", "3M", "1Y"];
              return (
                <button key={k} onClick={() => setSortKey(k)} style={{
                  padding: "3px 10px", borderRadius: 4, border: "1px solid",
                  fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
                  background: sortKey === k ? "var(--orange-dim)" : "var(--bg-hover)",
                  borderColor: sortKey === k ? "var(--orange-border)" : "var(--border)",
                  color: sortKey === k ? "var(--orange)" : "var(--t3)",
                }}>
                  {labels[i]}
                </button>
              );
            })}
          </div>

          {sectorLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 11 }).map((_, i) => <SkeletonBlock key={i} className="h-44" />)}
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
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>
              Sector Rotation (1Y, normalized to 100)
            </span>
            <p style={{ fontSize: "0.68rem", color: "var(--t3)", marginTop: 3 }}>
              Relative performance of SPDR sector ETFs. Diverging lines = sector rotation in progress.
            </p>
          </div>
          {sectorLoading ? (
            <SkeletonBlock className="h-96" />
          ) : rotationTraces.length > 0 ? (
            <Plot
              data={rotationTraces}
              layout={{ ...plotLayout, height: 420 }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          ) : (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>
              No data
            </div>
          )}

          {/* Sector performance table below chart */}
          {sectors.length > 0 && (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Sector", "ETF", "Price", "1D", "1M", "3M", "1Y", "RSI", "200MA", "50MA"].map(h => (
                      <th key={h} style={{ paddingBottom: 8, paddingRight: 12, textAlign: h === "Sector" || h === "ETF" ? "left" : "right", color: "var(--t3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.6rem" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...sectors].sort((a, b) => b.change_1y_pct - a.change_1y_pct).map(s => (
                    <tr key={s.etf} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 12px 7px 0", color: "var(--t1)", fontWeight: 600 }}>{s.sector}</td>
                      <td style={{ paddingRight: 12, color: "var(--orange)", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{s.etf}</td>
                      <td style={{ paddingRight: 12, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "var(--t1)" }}>${s.price.toFixed(2)}</td>
                      {[s.change_1d_pct, s.change_1m_pct, s.change_3m_pct, s.change_1y_pct].map((v, i) => (
                        <td key={i} style={{ paddingRight: 12, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: pctColor(v), fontWeight: 600 }}>
                          {fmtPct(v, 1)}
                        </td>
                      ))}
                      <td style={{ paddingRight: 12, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: s.rsi_14 > 70 ? "var(--red)" : s.rsi_14 < 30 ? "var(--green)" : "var(--t2)" }}>
                        {s.rsi_14.toFixed(0)}
                      </td>
                      <td style={{ paddingRight: 12, textAlign: "right", color: s.above_200ma ? "var(--green)" : "var(--red)" }}>
                        {s.above_200ma ? "▲" : "▼"}
                      </td>
                      <td style={{ textAlign: "right", color: s.above_50ma ? "var(--green)" : "var(--red)" }}>
                        {s.above_50ma ? "▲" : "▼"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>
                Market News
              </span>
              {newsLoading && <LoadingSpinner size="sm" />}
            </div>
            {newsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-16" />)}
              </div>
            ) : (
              <div>
                {(newsData?.news ?? []).map((item, i) => (
                  <NewsCard key={i} item={item} />
                ))}
                {!newsData?.news?.length && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: "0.78rem" }}>
                    No news available.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: trend summary */}
          <div className="space-y-4">
            {/* Top movers */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={13} style={{ color: "var(--green)" }} />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>
                  Top Sectors Today
                </span>
              </div>
              {sectorLoading ? <SkeletonBlock className="h-48 m-3" /> : (
                <div>
                  {[...sectors].sort((a, b) => b.change_1d_pct - a.change_1d_pct).map((s, i) => (
                    <div key={s.etf} style={{
                      display: "flex", alignItems: "center", padding: "8px 16px",
                      borderBottom: i < sectors.length - 1 ? "1px solid var(--border)" : "none",
                      gap: 10,
                    }}>
                      <span style={{ minWidth: 36, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "0.72rem", color: "var(--orange)" }}>{s.etf}</span>
                      <span style={{ flex: 1, fontSize: "0.72rem", color: "var(--t2)" }}>{s.sector}</span>
                      <Spark values={s.spark_30d} up={s.change_1d_pct >= 0} w={48} h={16} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", fontWeight: 600, color: pctColor(s.change_1d_pct), minWidth: 56, textAlign: "right" }}>
                        {fmtPct(s.change_1d_pct)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Institutional flow proxy */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Map size={13} style={{ color: "var(--orange)" }} />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t2)" }}>
                  Smart Money Flow (1M vs 3M)
                </span>
              </div>
              <p style={{ fontSize: "0.65rem", color: "var(--t3)", marginBottom: 12, lineHeight: 1.5 }}>
                Sectors where 1M return exceeds 3M average suggest institutional inflows. Divergence signals rotation.
              </p>
              {sectorLoading ? <SkeletonBlock className="h-40" /> : (
                <div className="space-y-1.5">
                  {[...sectors].sort((a, b) => (b.change_1m_pct - b.change_3m_pct / 3) - (a.change_1m_pct - a.change_3m_pct / 3)).map(s => {
                    const flow = s.change_1m_pct - s.change_3m_pct / 3;
                    const inflow = flow > 0;
                    return (
                      <div key={s.etf} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ minWidth: 36, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "0.68rem", color: "var(--orange)" }}>{s.etf}</span>
                        <div style={{ flex: 1, height: 5, background: "var(--bg-base)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.min(100, Math.abs(flow) * 5)}%`,
                            background: inflow ? "var(--green)" : "var(--red)",
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: "0.65rem", fontWeight: 600, color: inflow ? "var(--green)" : "var(--red)", minWidth: 50, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                          {inflow ? "▲" : "▼"} {Math.abs(flow).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
