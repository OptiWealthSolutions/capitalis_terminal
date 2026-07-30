"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { Card, CardHeader, SectionLabel } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Types (unchanged from original)
// ---------------------------------------------------------------------------
interface SectorData {
  etf: string;
  sector: string;
  price: number;
  change_1d_pct: number;
  change_1m_pct: number;
  rsi_14: number;
  above_200ma: boolean;
  above_50ma: boolean;
}

interface BreadthData {
  vix?: number;
  vix_change_pct?: number;
  advancing?: number;
  declining?: number;
  ad_ratio?: number;
  sectors_above_200ma?: number;
  sectors_above_50ma?: number;
  bullish?: number;
  bearish?: number;
  avg_rsi_14?: number;
  fear_greed?: number;
  fear_greed_label?: string;
  yield_spread?: number | null;
  total?: number;
}

interface MacroItem {
  symbol: string;
  label: string;
  category: string;
  price: number;
  change_1d_pct: number;
  change_1w_pct: number;
  change_1m_pct: number;
  change_3m_pct: number;
  spark: number[];
}

interface MacroData {
  macro: MacroItem[];
  curve_spread: number | null;
  inverted: boolean;
}

interface IndexItem {
  symbol: string;
  label: string;
  price: number;
  change_1d_pct: number;
  change_5d_pct: number;
  change_period_pct: number;
  spark: number[];
}

interface StressData {
  score: number;
  regime: string;
  components: Record<string, number>;
}

interface OverviewData {
  indices: IndexItem[];
  stress: StressData;
}

// ---------------------------------------------------------------------------
// Static sector top-holdings map (placeholder — ETF proxies for real constituents)
// ---------------------------------------------------------------------------
const SECTOR_HOLDINGS: Record<string, string[]> = {
  XLK:  ["AAPL", "MSFT", "NVDA"],
  XLF:  ["BRK.B", "JPM", "V"],
  XLV:  ["UNH", "JNJ", "LLY"],
  XLE:  ["XOM", "CVX", "COP"],
  XLI:  ["GE", "CAT", "UNP"],
  XLY:  ["AMZN", "TSLA", "HD"],
  XLP:  ["PG", "KO", "COST"],
  XLU:  ["NEE", "SO", "DUK"],
  XLB:  ["LIN", "APD", "ECL"],
  XLRE: ["AMT", "PLD", "CCI"],
  XLC:  ["META", "GOOGL", "NFLX"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pctColor(v: number): string {
  return v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--t3)";
}
function fmtPct(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function fmtCap(price: number): string {
  // ETF price used as proxy — format as price
  return `$${price.toFixed(2)}`;
}

// Compute market regime label
function computeRegimeLabel(breadth: BreadthData | undefined, sectors: SectorData[]): string {
  if (!breadth || sectors.length === 0) return "—";
  const vix = breadth.vix ?? 0;
  const adRatio = breadth.ad_ratio ?? 1;
  const pctAbove = (breadth.sectors_above_200ma ?? 0) / (sectors.length || 11);
  const avgRsi = breadth.avg_rsi_14 ?? 50;
  let score = 0;
  if (vix < 16) score += 2; else if (vix < 22) score += 1; else if (vix > 30) score -= 2; else score -= 1;
  if (adRatio > 1.5) score += 2; else if (adRatio > 1) score += 1; else if (adRatio < 0.6) score -= 2; else score -= 1;
  if (pctAbove > 0.7) score += 2; else if (pctAbove > 0.5) score += 1; else if (pctAbove < 0.3) score -= 2; else score -= 1;
  if (avgRsi > 60) score += 1; else if (avgRsi < 40) score -= 1;
  if (score >= 4) return "Risk-On";
  if (score >= 1) return "Constructive";
  if (score >= -1) return "Neutral";
  if (score >= -3) return "Cautious";
  return "Risk-Off";
}

function fearGreedProxy(breadth: BreadthData | undefined): { score: number; label: string; color: string } {
  if (!breadth) return { score: 50, label: "—", color: "var(--t3)" };
  // Use backend-computed value when available
  if (breadth.fear_greed != null) {
    const score = Math.round(breadth.fear_greed);
    const label = breadth.fear_greed_label ?? (
      score >= 75 ? "Extreme Greed" : score >= 60 ? "Greed" :
      score >= 45 ? "Neutral" : score >= 30 ? "Fear" : "Extreme Fear"
    );
    const color = score >= 60 ? "var(--green)" : score >= 45 ? "var(--t1)" : score >= 30 ? "var(--orange)" : "var(--red)";
    return { score, label, color };
  }
  // Fallback: compute from available fields
  const vixScore = Math.max(0, Math.min(100, 100 - ((breadth.vix ?? 0) / 50) * 100));
  const adScore  = Math.max(0, Math.min(100, ((breadth.ad_ratio ?? 1) / 3) * 100));
  const maScore  = Math.max(0, Math.min(100, ((breadth.sectors_above_200ma ?? 0) / 11) * 100));
  const rsiScore = Math.max(0, Math.min(100, (((breadth.avg_rsi_14 ?? 50) - 20) / 60) * 100));
  const score = Math.round((vixScore * 0.35) + (adScore * 0.25) + (maScore * 0.25) + (rsiScore * 0.15));
  let label: string;
  let color: string;
  if (score >= 75)      { label = "Extreme Greed"; color = "var(--green)"; }
  else if (score >= 60) { label = "Greed";          color = "var(--green)"; }
  else if (score >= 45) { label = "Neutral";         color = "var(--t1)"; }
  else if (score >= 30) { label = "Fear";            color = "var(--orange)"; }
  else                  { label = "Extreme Fear";    color = "var(--red)"; }
  return { score, label, color };
}

// ---------------------------------------------------------------------------
// KPI Strip
// ---------------------------------------------------------------------------
function KpiStrip({
  breadth, sectors, overview,
}: {
  breadth: BreadthData | undefined;
  sectors: SectorData[];
  overview: OverviewData | undefined;
}) {
  const fg = fearGreedProxy(breadth);
  const regimeLabel = computeRegimeLabel(breadth, sectors);
  const adv = breadth?.advancing ?? 0;
  const dec = breadth?.declining ?? 0;
  const total = adv + dec || 1;

  // Most active sector = highest abs change
  const mostActive = useMemo(
    () => sectors.length
      ? [...sectors].sort((a, b) => Math.abs(b.change_1d_pct) - Math.abs(a.change_1d_pct))[0]
      : null,
    [sectors],
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1.2fr", gap: 12, marginBottom: 28 }}>

      {/* 1 - Fear/Greed (dark variant) */}
      <Card variant="dark" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <SectionLabel>Fear / Greed</SectionLabel>
        <div style={{
          fontFamily: "Manrope, sans-serif", fontSize: "1.85rem", fontWeight: 700,
          color: fg.color, letterSpacing: "-0.02em", lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {fg.score}
        </div>
        <p style={{ fontSize: "0.68rem", color: fg.color, margin: 0, fontWeight: 600 }}>{fg.label}</p>
      </Card>

      {/* 2 - A/D Ratio */}
      <Card variant="default" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <SectionLabel>Advancers / Decliners</SectionLabel>
        <div style={{
          fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700,
          color: (breadth?.ad_ratio ?? 1) >= 1 ? "var(--green)" : "var(--red)",
          letterSpacing: "-0.02em", lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {adv} <span style={{ fontSize: "0.9rem", color: "var(--t3)", fontWeight: 500 }}>vs</span> {dec}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: "var(--bg-inner)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(adv / total) * 100}%`,
              background: "var(--green)",
              borderRadius: 2,
              transition: "width 0.4s",
            }} />
          </div>
          <span style={{ fontSize: "0.62rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>
            {((adv / total) * 100).toFixed(0)}%
          </span>
        </div>
      </Card>

      {/* 3 - VIX */}
      <Card variant="default" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <SectionLabel>Volatility (VIX)</SectionLabel>
        <div style={{
          fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700,
          color: (breadth?.vix ?? 0) < 16
            ? "var(--green)" : (breadth?.vix ?? 0) < 25
            ? "var(--t1)" : "var(--red)",
          letterSpacing: "-0.02em", lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {breadth?.vix != null ? breadth.vix.toFixed(1) : "—"}
        </div>
        <p style={{ fontSize: "0.68rem", color: "var(--t3)", margin: 0 }}>
          1d: <span style={{ color: pctColor(-(breadth?.vix_change_pct ?? 0)), fontWeight: 600 }}>
            {breadth?.vix_change_pct != null ? fmtPct(breadth.vix_change_pct) : "—"}
          </span>
        </p>
      </Card>

      {/* 4 - Most Active Sector */}
      <Card variant="default" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <SectionLabel>Most Active Sector</SectionLabel>
        {mostActive ? (
          <>
            <div style={{
              fontFamily: "Manrope, sans-serif", fontSize: "1.05rem", fontWeight: 700,
              color: "var(--t1)", letterSpacing: "-0.01em", lineHeight: 1.2,
            }}>
              {mostActive.sector}
            </div>
            <div style={{
              fontSize: "0.78rem", fontWeight: 700,
              color: pctColor(mostActive.change_1d_pct),
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtPct(mostActive.change_1d_pct)} today
            </div>
          </>
        ) : (
          <div style={{ fontSize: "0.78rem", color: "var(--t3)" }}>—</div>
        )}
      </Card>

      {/* 5 - Market Regime (dark variant, wider) */}
      <Card variant="dark" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <SectionLabel>Market Regime</SectionLabel>
        <div style={{
          fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700,
          color: "var(--orange)", letterSpacing: "-0.02em", lineHeight: 1,
        }}>
          {regimeLabel}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { l: ">200MA", v: `${breadth?.sectors_above_200ma ?? 0}/${sectors.length || 11}` },
            { l: "RSI", v: breadth?.avg_rsi_14 != null ? breadth.avg_rsi_14.toFixed(0) : "—" },
          ].map(b => (
            <span key={b.l} style={{
              fontSize: "0.58rem", fontWeight: 600, padding: "2px 7px",
              borderRadius: "var(--r-md)",
              background: "rgba(127,127,127,0.12)",
              color: "var(--t2)",
              fontVariantNumeric: "tabular-nums",
            }}>
              <span style={{ color: "var(--t3)", marginRight: 4 }}>{b.l}</span>{b.v}
            </span>
          ))}
        </div>
      </Card>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sector Card (expandable)
// ---------------------------------------------------------------------------
function SectorCard({ s, isExpanded, onToggle }: {
  s: SectorData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const holdings = SECTOR_HOLDINGS[s.etf] ?? [];
  const chg1d = s.change_1d_pct;
  const chg1m = s.change_1m_pct;

  // Slightly vary card min-heights by sector to avoid identical grid
  const minH = (s.etf.charCodeAt(2) % 3 === 0) ? 148 : (s.etf.charCodeAt(2) % 3 === 1) ? 140 : 132;

  return (
    <div
      onClick={onToggle}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${isExpanded ? "var(--orange)" : "var(--card-border)"}`,
        borderRadius: "var(--r-xl)",
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.12s",
        minHeight: minH,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
      onMouseEnter={e => {
        if (!isExpanded) e.currentTarget.style.borderColor = "var(--orange-border, rgba(220,130,50,0.45))";
      }}
      onMouseLeave={e => {
        if (!isExpanded) e.currentTarget.style.borderColor = "var(--card-border)";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.09em",
            textTransform: "uppercase", color: "var(--orange)", marginBottom: 3,
          }}>
            {s.etf}
          </div>
          <div style={{
            fontFamily: "Manrope, sans-serif",
            fontSize: "0.88rem", fontWeight: 700, color: "var(--t1)",
            lineHeight: 1.2, letterSpacing: "-0.005em",
          }}>
            {s.sector}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "Manrope, sans-serif",
            fontSize: "1.05rem", fontWeight: 700, color: pctColor(chg1d),
            fontVariantNumeric: "tabular-nums", lineHeight: 1,
          }}>
            {fmtPct(chg1d)}
          </div>
          <div style={{
            fontSize: "0.62rem", color: "var(--t3)", marginTop: 2,
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmtCap(s.price)}
          </div>
        </div>
      </div>

      {/* 1M mini bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: "0.55rem", color: "var(--t3)" }}>1M performance</span>
          <span style={{
            fontSize: "0.62rem", fontWeight: 600, color: pctColor(chg1m),
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmtPct(chg1m, 1)}
          </span>
        </div>
        <div style={{ height: 3, background: "var(--bg-inner)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, Math.abs(chg1m) * 6)}%`,
            background: chg1m >= 0 ? "var(--green)" : "var(--red)",
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Top 3 holdings */}
      {holdings.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {holdings.slice(0, 3).map(h => (
            <span key={h} style={{
              fontSize: "0.6rem", fontWeight: 600,
              padding: "2px 8px", borderRadius: "var(--r-md)",
              background: "var(--bg-inner)", color: "var(--t2)",
              letterSpacing: "0.02em",
            }}>
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Expanded sub-table */}
      {isExpanded && (
        <div style={{ marginTop: 4 }} onClick={e => e.stopPropagation()}>
          <div style={{ height: 1, background: "var(--card-border)", marginBottom: 10 }} />
          <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--t3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            Top constituents
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
            <tbody>
              {(SECTOR_HOLDINGS[s.etf] ?? []).map((ticker, idx) => (
                <tr key={ticker} style={{ borderBottom: "1px solid rgba(127,127,127,0.06)" }}>
                  <td style={{ padding: "5px 0", color: "var(--t3)", width: 22, fontVariantNumeric: "tabular-nums" }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: "5px 0", fontWeight: 700, color: "var(--t1)" }}>{ticker}</td>
                  <td style={{ padding: "5px 0", textAlign: "right", color: "var(--t3)", fontSize: "0.62rem" }}>
                    {s.etf} constituent
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            {[
              { l: "RSI", v: s.rsi_14 != null ? s.rsi_14.toFixed(0) : "—", color: (s.rsi_14 ?? 50) > 70 ? "var(--red)" : (s.rsi_14 ?? 50) < 30 ? "var(--green)" : "var(--t2)" },
              { l: ">200MA", v: s.above_200ma ? "Yes" : "No", color: s.above_200ma ? "var(--green)" : "var(--red)" },
              { l: ">50MA",  v: s.above_50ma  ? "Yes" : "No", color: s.above_50ma  ? "var(--green)" : "var(--red)" },
            ].map(m => (
              <div key={m.l} style={{ textAlign: "center", background: "var(--bg-inner)", borderRadius: 6, padding: "4px 8px", flex: 1 }}>
                <div style={{ fontSize: "0.5rem", color: "var(--t3)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.l}</div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: m.color }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sectors Grid (3-col, left panel 3fr)
// ---------------------------------------------------------------------------
function SectorsPanel({ sectors }: { sectors: SectorData[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = useMemo(() => [...sectors].sort((a, b) => b.change_1d_pct - a.change_1d_pct), [sectors]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{
          fontFamily: "Manrope, sans-serif",
          fontSize: "1rem", fontWeight: 700, color: "var(--t1)",
          letterSpacing: "-0.01em", margin: 0, marginBottom: 4,
        }}>
          Sectors
        </h2>
        <p style={{ fontSize: "0.72rem", color: "var(--t3)", margin: 0 }}>
          Click a sector to expand holdings. Sorted by today's performance.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {sorted.map(s => (
          <SectorCard
            key={s.etf}
            s={s}
            isExpanded={expanded === s.etf}
            onToggle={() => setExpanded(prev => prev === s.etf ? null : s.etf)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mover Row (extracted to avoid component-in-component remount)
// ---------------------------------------------------------------------------
function MoverRow({ s, rank }: { s: SectorData; rank: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "9px 0",
      borderBottom: "1px solid rgba(127,127,127,0.06)",
    }}>
      <span style={{ fontSize: "0.6rem", color: "var(--t3)", minWidth: 14, fontVariantNumeric: "tabular-nums" }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "0.01em" }}>
          {s.etf}
        </div>
        <div style={{
          fontSize: "0.58rem", color: "var(--t3)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {s.sector}
        </div>
      </div>
      <span style={{
        fontSize: "0.78rem", fontWeight: 700,
        color: pctColor(s.change_1d_pct),
        fontVariantNumeric: "tabular-nums",
        fontFamily: "Manrope, sans-serif",
      }}>
        {fmtPct(s.change_1d_pct)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Movers Panel (right 1fr)
// ---------------------------------------------------------------------------
function TopMoversPanel({ sectors }: { sectors: SectorData[] }) {
  const gainers = useMemo(() => [...sectors].sort((a, b) => b.change_1d_pct - a.change_1d_pct).slice(0, 5), [sectors]);
  const losers  = useMemo(() => [...sectors].sort((a, b) => a.change_1d_pct - b.change_1d_pct).slice(0, 5), [sectors]);

  return (
    <Card variant="default" pad="none" style={{ position: "sticky", top: 20 }}>
      <CardHeader title="Top Movers" subtitle="Today's sector leaders" bordered />
      <div style={{ padding: "8px 18px 4px" }}>
        <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--green)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          Gainers
        </div>
        {gainers.map((s, i) => <MoverRow key={s.etf} s={s} rank={i + 1} />)}
      </div>
      <div style={{ height: 1, background: "var(--card-border)", margin: "8px 0" }} />
      <div style={{ padding: "4px 18px 14px" }}>
        <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--red)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          Losers
        </div>
        {losers.map((s, i) => <MoverRow key={s.etf} s={s} rank={i + 1} />)}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screener Shortcut Row
// ---------------------------------------------------------------------------
const SCREENER_CHIPS: { label: string; filter: string; hint: string }[] = [
  { label: "High Dividend",      filter: "high-dividend",     hint: "Yield > 3.5%, stable payout" },
  { label: "Growth Momentum",    filter: "growth-momentum",   hint: "EPS growth + price momentum" },
  { label: "Low Volatility",     filter: "low-volatility",    hint: "Beta < 0.7, defensive names" },
  { label: "Small Cap",          filter: "small-cap",         hint: "Market cap < $2B" },
];

function ScreenerShortcuts() {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--t3)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Quick screener filters
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--card-border)" }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {SCREENER_CHIPS.map(chip => (
          <button
            key={chip.filter}
            onClick={() => router.push(`/screener?filter=${chip.filter}`)}
            title={chip.hint}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--r-xl)",
              border: "1px solid var(--card-border)",
              background: "var(--bg-card)",
              color: "var(--t1)",
              fontSize: "0.74rem", fontWeight: 600,
              cursor: "pointer",
              transition: "border-color 0.12s, background 0.12s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "var(--orange)";
              e.currentTarget.style.color = "var(--orange)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--card-border)";
              e.currentTarget.style.color = "var(--t1)";
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indices View
// ---------------------------------------------------------------------------
function SparkInline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 60;
    const y = 14 - ((v - min) / range) * 14;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={60} height={16} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IndicesView({ overview }: { overview: OverviewData | undefined }) {
  if (!overview) return <div style={{ padding: 40, textAlign: "center", color: "var(--t3)", fontSize: "0.8rem" }}>Loading indices…</div>;

  const CATEGORY: Record<string, string> = {
    "^GSPC": "US Equity", "^NDX": "US Equity", "^DJI": "US Equity", "^RUT": "US Equity",
    "^STOXX50E": "Global", "^FTSE": "Global", "^N225": "Global",
    "^VIX": "Volatility", "^TNX": "Rates",
    "GC=F": "Commodities", "CL=F": "Commodities",
    "BTC-USD": "Crypto",
  };

  const groups = Array.from(new Set(overview.indices.map(i => CATEGORY[i.symbol] ?? "Other")));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map(grp => {
        const items = overview.indices.filter(i => (CATEGORY[i.symbol] ?? "Other") === grp);
        return (
          <Card key={grp} variant="default" pad="none">
            <div style={{ padding: "10px 20px 8px", borderBottom: "1px solid var(--card-border)" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--orange)" }}>{grp}</span>
            </div>
            <div>
              {items.map((idx, i) => {
                const c1d = idx.change_1d_pct;
                const sparkColor = c1d >= 0 ? "var(--green)" : "var(--red)";
                return (
                  <div key={idx.symbol} style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto auto 70px",
                    alignItems: "center", gap: 16,
                    padding: "11px 20px",
                    borderBottom: i < items.length - 1 ? "1px solid var(--card-border)" : "none",
                  }}>
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.005em" }}>{idx.label}</div>
                      <div style={{ fontSize: "0.58rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{idx.symbol}</div>
                    </div>
                    <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 80 }}>
                      {idx.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.78rem", color: pctColor(c1d), fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 56 }}>
                      {fmtPct(c1d)}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "0.72rem", color: pctColor(idx.change_5d_pct ?? 0), fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 56 }}>
                      5D {fmtPct(idx.change_5d_pct ?? 0, 1)}
                    </div>
                    <SparkInline data={idx.spark} color={sparkColor} />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Macro View
// ---------------------------------------------------------------------------
function MacroView({ macro }: { macro: MacroData | undefined }) {
  if (!macro) return <div style={{ padding: 40, textAlign: "center", color: "var(--t3)", fontSize: "0.8rem" }}>Loading macro data…</div>;

  const ORDER = ["equity", "rates", "volatility", "currency", "commodities", "bonds", "crypto"];
  const LABELS: Record<string, string> = {
    equity: "Equity", rates: "Rates", volatility: "Volatility",
    currency: "Currency", commodities: "Commodities", bonds: "Bonds", crypto: "Crypto",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Yield curve banner */}
      {macro.curve_spread != null && (
        <Card variant="dark" pad="md" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div>
            <SectionLabel>Yield Curve (10Y – 3M)</SectionLabel>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700, color: macro.inverted ? "var(--red)" : "var(--green)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", marginTop: 4 }}>
              {macro.curve_spread > 0 ? "+" : ""}{macro.curve_spread.toFixed(2)}%
            </div>
          </div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ padding: "8px 18px", borderRadius: "var(--r-xl)", background: macro.inverted ? "rgba(212,133,133,0.15)" : "rgba(134,179,138,0.15)", border: `1px solid ${macro.inverted ? "rgba(212,133,133,0.3)" : "rgba(134,179,138,0.3)"}` }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: macro.inverted ? "var(--red)" : "var(--green)", marginBottom: 2 }}>
              {macro.inverted ? "Inverted" : "Normal"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--t3)" }}>
              {macro.inverted ? "Recession signal" : "Expansion regime"}
            </div>
          </div>
        </Card>
      )}

      {ORDER.map(cat => {
        const items = macro.macro.filter(m => m.category === cat);
        if (items.length === 0) return null;
        return (
          <Card key={cat} variant="default" pad="none">
            <div style={{ padding: "10px 20px 8px", borderBottom: "1px solid var(--card-border)" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--orange)" }}>{LABELS[cat]}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {items.map((m, i) => (
                <div key={m.symbol} style={{
                  padding: "14px 18px",
                  borderRight: (i + 1) % Math.ceil(items.length / Math.ceil(items.length / 4)) === 0 ? "none" : "1px solid var(--card-border)",
                  borderBottom: i < items.length - Math.ceil(items.length / 2) ? "1px solid var(--card-border)" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--t1)" }}>{m.label}</div>
                      <div style={{ fontSize: "0.56rem", color: "var(--t3)", marginTop: 1 }}>{m.symbol}</div>
                    </div>
                    <SparkInline data={m.spark} color={m.change_1m_pct >= 0 ? "var(--green)" : "var(--red)"} />
                  </div>
                  <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", marginBottom: 8 }}>
                    {m.price.toLocaleString(undefined, { maximumFractionDigits: m.price < 10 ? 4 : m.price < 100 ? 2 : 0 })}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { l: "1D", v: m.change_1d_pct },
                      { l: "1W", v: m.change_1w_pct },
                      { l: "1M", v: m.change_1m_pct },
                      { l: "3M", v: m.change_3m_pct },
                    ].map(d => (
                      <div key={d.l} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "0.5rem", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{d.l}</div>
                        <div style={{ fontSize: "0.68rem", fontWeight: 700, color: pctColor(d.v), fontVariantNumeric: "tabular-nums" }}>{fmtPct(d.v, 1)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internals (Breadth deep-dive)
// ---------------------------------------------------------------------------
function InternalsView({ breadth, overview }: { breadth: BreadthData | undefined; overview: OverviewData | undefined }) {
  const fg = fearGreedProxy(breadth);

  const fgArc = (score: number) => {
    const angle = (score / 100) * Math.PI;
    const r = 52;
    const cx = 70, cy = 70;
    const x = cx - r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;
  };

  const stressScore = overview?.stress?.score ?? 0;
  const stressComponents = overview?.stress?.components ?? {};

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

      {/* Fear / Greed gauge */}
      <Card variant="dark" pad="lg" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <SectionLabel style={{ alignSelf: "flex-start" }}>Fear / Greed Index</SectionLabel>
        <div style={{ position: "relative", width: 140, height: 78 }}>
          <svg viewBox="0 0 140 80" style={{ width: 140, height: 80 }}>
            {/* BG arc */}
            <path d="M 18 70 A 52 52 0 0 1 122 70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} strokeLinecap="round" />
            {/* Colored arc */}
            <path d={fgArc(fg.score).replace("M 18 70", "M 18 70")} fill="none"
              stroke={fg.color.replace("var(--green)", "#86B38A").replace("var(--orange)", "#D4943A").replace("var(--red)", "#D48585").replace("var(--t1)", "#CBD5E1")}
              strokeWidth={10} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.85rem", fontWeight: 700, color: fg.color, lineHeight: 1, letterSpacing: "-0.02em" }}>{fg.score}</div>
          </div>
        </div>
        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: fg.color, letterSpacing: "0.02em" }}>{fg.label}</div>
        <div style={{ display: "flex", gap: 4, fontSize: "0.55rem", color: "var(--t3)" }}>
          {["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"].map((l, i) => (
            <span key={l} style={{ padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.05)" }}>{l}</span>
          ))}
        </div>
      </Card>

      {/* Yield Curve */}
      <Card variant="dark" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionLabel>Yield Curve</SectionLabel>
        <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: breadth?.yield_spread != null ? (breadth.yield_spread < 0 ? "var(--red)" : "var(--green)") : "var(--t3)" }}>
          {breadth?.yield_spread != null ? `${breadth.yield_spread > 0 ? "+" : ""}${breadth.yield_spread.toFixed(2)}%` : "—"}
        </div>
        <div style={{ fontSize: "0.68rem", color: "var(--t3)" }}>10Y – 3M spread</div>
        {breadth?.yield_spread != null && (
          <div style={{ padding: "8px 12px", borderRadius: "var(--r-md)", background: breadth.yield_spread < 0 ? "rgba(212,133,133,0.12)" : "rgba(134,179,138,0.12)", marginTop: 4 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: breadth.yield_spread < 0 ? "var(--red)" : "var(--green)" }}>
              {breadth.yield_spread < 0 ? "Inverted — recession signal" : "Normal — expansionary"}
            </div>
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          {[
            { l: "US 10Y", v: overview?.indices?.find(i => i.symbol === "^TNX")?.price },
            { l: "Gold",   v: overview?.indices?.find(i => i.symbol === "GC=F")?.price },
          ].filter(r => r.v != null).map(r => (
            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "var(--t3)" }}>{r.l}</span>
              <span style={{ color: "var(--t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.v?.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Market Stress */}
      <Card variant="dark" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionLabel>Market Stress Score</SectionLabel>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.85rem", fontWeight: 700, color: stressScore >= 75 ? "var(--red)" : stressScore >= 50 ? "var(--orange)" : stressScore >= 25 ? "var(--t1)" : "var(--green)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            {stressScore.toFixed(0)}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--t3)", marginBottom: 4 }}>{overview?.stress?.regime ?? "—"}</div>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
          <div style={{ height: "100%", width: `${stressScore}%`, background: stressScore >= 75 ? "var(--red)" : stressScore >= 50 ? "var(--orange)" : "var(--green)", borderRadius: 2, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
          {Object.entries(stressComponents).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.62rem", color: "var(--t3)", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
              <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 1, overflow: "hidden", maxWidth: 70 }}>
                <div style={{ height: "100%", width: `${v}%`, background: v >= 75 ? "var(--red)" : v >= 50 ? "var(--orange)" : "var(--green)", borderRadius: 1 }} />
              </div>
              <span style={{ fontSize: "0.62rem", color: "var(--t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 24, textAlign: "right" }}>{v.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* A/D Breadth */}
      <Card variant="default" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionLabel>Advancers / Decliners</SectionLabel>
        <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700, color: (breadth?.ad_ratio ?? 1) >= 1 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1 }}>
          {breadth?.advancing ?? 0} <span style={{ fontSize: "0.9rem", color: "var(--t3)", fontWeight: 500 }}>vs</span> {breadth?.declining ?? 0}
        </div>
        <div style={{ height: 6, background: "var(--bg-inner)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((breadth?.advancing ?? 0) / ((breadth?.advancing ?? 0) + (breadth?.declining ?? 0) || 1)) * 100}%`, background: "var(--green)", borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem" }}>
          <span style={{ color: "var(--green)" }}>▲ Advancing sectors</span>
          <span style={{ color: "var(--red)" }}>▼ Declining</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
          <span style={{ color: "var(--t3)" }}>A/D Ratio</span>
          <span style={{ fontWeight: 700, color: (breadth?.ad_ratio ?? 1) >= 1 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums" }}>{(breadth?.ad_ratio ?? 1).toFixed(2)}x</span>
        </div>
      </Card>

      {/* RSI Overview */}
      <Card variant="default" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionLabel>Market RSI (avg)</SectionLabel>
        <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1,
          color: (breadth?.avg_rsi_14 ?? 50) > 70 ? "var(--red)" : (breadth?.avg_rsi_14 ?? 50) < 30 ? "var(--green)" : "var(--t1)" }}>
          {breadth?.avg_rsi_14 != null ? breadth.avg_rsi_14.toFixed(1) : "—"}
        </div>
        <div style={{ position: "relative", height: 6, background: "var(--bg-inner)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${breadth?.avg_rsi_14 ?? 50}%`, background: `linear-gradient(to right, var(--green), var(--orange) 60%, var(--red))`, borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.58rem", color: "var(--t3)" }}>
          <span>0 Oversold</span><span>50</span><span>Overbought 100</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
          {[
            { l: ">200MA", v: `${breadth?.sectors_above_200ma ?? 0}/${breadth?.total ?? 11}` },
            { l: ">50MA",  v: `${breadth?.sectors_above_50ma  ?? 0}/${breadth?.total ?? 11}` },
          ].map(m => (
            <div key={m.l} style={{ flex: 1, padding: "6px 8px", background: "var(--bg-inner)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.5rem", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{m.l}</div>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums" }}>{m.v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Bullish/Bearish tally */}
      <Card variant="default" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionLabel>Bull/Bear Tally</SectionLabel>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--green)", marginBottom: 4 }}>Bullish</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--green)", lineHeight: 1, letterSpacing: "-0.02em" }}>{breadth?.bullish ?? 0}</div>
            <div style={{ fontSize: "0.62rem", color: "var(--t3)", marginTop: 2 }}>above 200MA + up 1M</div>
          </div>
          <div style={{ width: 1, background: "var(--card-border)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--red)", marginBottom: 4 }}>Bearish</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--red)", lineHeight: 1, letterSpacing: "-0.02em" }}>{breadth?.bearish ?? 0}</div>
            <div style={{ fontSize: "0.62rem", color: "var(--t3)", marginTop: 2 }}>below 200MA + down 1M</div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: 4 }}>
            <span style={{ color: "var(--t3)" }}>Bias</span>
            <span style={{ fontWeight: 700, color: (breadth?.bullish ?? 0) > (breadth?.bearish ?? 0) ? "var(--green)" : "var(--red)" }}>
              {(breadth?.bullish ?? 0) > (breadth?.bearish ?? 0) ? "Bullish" : (breadth?.bullish ?? 0) < (breadth?.bearish ?? 0) ? "Bearish" : "Mixed"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------
type MarketTab = "sectors" | "indices" | "macro" | "internals";
const TABS: { id: MarketTab; label: string }[] = [
  { id: "sectors",   label: "Sectors" },
  { id: "indices",   label: "Global Indices" },
  { id: "macro",     label: "Macro" },
  { id: "internals", label: "Internals" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MarketsDiscoveryPage() {
  const { data: sectorResp, isLoading: sectorLoading } = useQuery<{ sectors: SectorData[] }>({
    queryKey:       ["market-sectors"],
    queryFn:        () => get("/market/sectors"),
    staleTime:      5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: breadth, isLoading: breadthLoading } = useQuery<BreadthData>({
    queryKey:       ["market-breadth"],
    queryFn:        () => get("/market/breadth"),
    staleTime:      5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey:       ["market-overview"],
    queryFn:        () => get("/market/overview"),
    staleTime:      5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const sectors = sectorResp?.sectors ?? [];
  const anyLoading = sectorLoading || breadthLoading || overviewLoading;

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        flexWrap: "wrap", gap: 14, marginBottom: 28,
      }}>
        <div>
          <h1 style={{
            fontFamily: "Manrope, sans-serif",
            fontSize: "1.85rem", fontWeight: 700,
            color: "var(--t1)", letterSpacing: "-0.018em", lineHeight: 1.15,
            marginBottom: 4, marginTop: 0,
          }}>
            Markets Discovery
          </h1>
          <p style={{ fontSize: "0.84rem", color: "var(--t3)", margin: 0 }}>
            Sector-level market intelligence — find where momentum lives.
          </p>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 11px", borderRadius: "var(--r-full, 9999px)",
          background: "rgba(134,179,138,0.12)",
          border: "1px solid rgba(134,179,138,0.25)",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "var(--green)", flexShrink: 0,
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--green)", letterSpacing: "0.05em" }}>
            Live
          </span>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      {anyLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1.2fr", gap: 12, marginBottom: 28 }}>
          {[0,1,2,3,4].map(i => <SkeletonBlock key={i} className="h-28" />)}
        </div>
      ) : (
        <KpiStrip breadth={breadth} sectors={sectors} overview={overview} />
      )}

      {/* ── Main 2-col grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 20, alignItems: "start" }}>

        {/* Left — Sectors grid */}
        {sectorLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {Array.from({ length: 9 }).map((_, i) => <SkeletonBlock key={i} className="h-36" />)}
          </div>
        ) : (
          <SectorsPanel sectors={sectors} />
        )}

        {/* Right — Top movers */}
        {sectorLoading ? (
          <SkeletonBlock className="h-96" />
        ) : (
          <TopMoversPanel sectors={sectors} />
        )}

      </div>

      {/* ── Screener shortcuts ── */}
      <ScreenerShortcuts />

      <style jsx>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(134,179,138,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(134,179,138,0); }
          100% { box-shadow: 0 0 0 0 rgba(134,179,138,0); }
        }
      `}</style>
    </div>
  );
}
