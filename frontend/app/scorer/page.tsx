"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post, errMsg } from "@/lib/api";
import type { ScorerResult } from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatNumber, formatPercent } from "@/lib/utils";
import {
  Play, RotateCcw, ChevronDown, ChevronUp, Sliders, Download, Sparkles, RefreshCw, Search, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useInvestorMode } from "@/lib/investorMode";
import TickerLogo from "@/components/ui/TickerLogo";

// ---------------------------------------------------------------------------
// Weight definitions
// ---------------------------------------------------------------------------
interface WeightEntry { key: string; label: string; defaultVal: number; group: string; hint: string }

const WEIGHT_DEFS: WeightEntry[] = [
  { key: "F_Score",            label: "F-Score (Piotroski)",   defaultVal: 0.25, group: "Quality",       hint: "9-point financial strength score" },
  { key: "returnOnEquity",     label: "Return on Equity",      defaultVal: 0.10, group: "Quality",       hint: "Net income / shareholders equity" },
  { key: "earningsGrowth",     label: "Earnings Growth",       defaultVal: 0.10, group: "Quality",       hint: "YoY EPS diluted growth" },
  { key: "trailingPE",         label: "Trailing P/E (inv.)",   defaultVal: 0.20, group: "Valuation",     hint: "Lower P/E = higher score" },
  { key: "pct_undervaluation", label: "Graham Undervaluation", defaultVal: 0.05, group: "Valuation",     hint: "Discount to Graham intrinsic value" },
  { key: "Sharpe",             label: "Sharpe Ratio",          defaultVal: 0.20, group: "Risk / Return", hint: "Risk-adjusted excess return" },
  { key: "Sortino",            label: "Sortino Ratio",         defaultVal: 0.00, group: "Risk / Return", hint: "Downside risk-adjusted return" },
  { key: "CAGR",               label: "CAGR",                  defaultVal: 0.05, group: "Risk / Return", hint: "Compound annual growth rate" },
  { key: "Vol_Ann",            label: "Volatility (inv.)",     defaultVal: 0.05, group: "Risk / Return", hint: "Lower volatility = higher score" },
];

const GROUPS = ["Quality", "Valuation", "Risk / Return"];

// ---------------------------------------------------------------------------
// Scoring presets
// ---------------------------------------------------------------------------
interface ScoringPreset { id: string; label: string; description: string; weights: Record<string, number> }

const SCORING_PRESETS: ScoringPreset[] = [
  { id: "balanced",     label: "Balanced",     description: "Equal weight across quality, value and momentum",  weights: { F_Score: 0.25, returnOnEquity: 0.10, earningsGrowth: 0.05, trailingPE: 0.15, pct_undervaluation: 0.05, Sharpe: 0.20, Sortino: 0.05, CAGR: 0.10, Vol_Ann: 0.05 } },
  { id: "growth",       label: "Growth",       description: "Earnings momentum and CAGR over valuation",        weights: { F_Score: 0.10, returnOnEquity: 0.15, earningsGrowth: 0.25, trailingPE: 0.05, pct_undervaluation: 0.00, Sharpe: 0.15, Sortino: 0.05, CAGR: 0.20, Vol_Ann: 0.05 } },
  { id: "value",        label: "Deep Value",   description: "Low P/E and Graham margin of safety",              weights: { F_Score: 0.20, returnOnEquity: 0.05, earningsGrowth: 0.05, trailingPE: 0.30, pct_undervaluation: 0.20, Sharpe: 0.10, Sortino: 0.00, CAGR: 0.05, Vol_Ann: 0.05 } },
  { id: "quality",      label: "Quality",      description: "High F-Score, strong ROE",                          weights: { F_Score: 0.40, returnOnEquity: 0.20, earningsGrowth: 0.10, trailingPE: 0.10, pct_undervaluation: 0.00, Sharpe: 0.10, Sortino: 0.05, CAGR: 0.05, Vol_Ann: 0.00 } },
  { id: "momentum",     label: "Momentum",     description: "Recent risk-adjusted performance dominates",       weights: { F_Score: 0.05, returnOnEquity: 0.05, earningsGrowth: 0.10, trailingPE: 0.05, pct_undervaluation: 0.00, Sharpe: 0.35, Sortino: 0.10, CAGR: 0.25, Vol_Ann: 0.05 } },
  { id: "conservative", label: "Conservative", description: "Low volatility, stable fundamentals",               weights: { F_Score: 0.20, returnOnEquity: 0.10, earningsGrowth: 0.00, trailingPE: 0.15, pct_undervaluation: 0.10, Sharpe: 0.20, Sortino: 0.10, CAGR: 0.05, Vol_Ann: 0.10 } },
];

// ---------------------------------------------------------------------------
// Factor sub-score grouping (image-style: Quality/Growth/Value/Momentum/Volatility)
// ---------------------------------------------------------------------------
const SUB_FACTORS: { key: string; label: string; sources: string[]; inverse?: boolean }[] = [
  { key: "Quality",    label: "Quality",    sources: ["F_Score", "returnOnEquity"] },
  { key: "Growth",     label: "Growth",     sources: ["earningsGrowth", "CAGR"] },
  { key: "Value",      label: "Value",      sources: ["trailingPE"], inverse: true },
  { key: "Momentum",   label: "Momentum",   sources: ["Sharpe", "Sortino"] },
  { key: "Volatility", label: "Volatility", sources: ["Vol_Ann"], inverse: true },
];

const RESULT_COLS: { key: string; label: string; fmt?: (v: number) => string }[] = [
  { key: "ticker",         label: "Ticker" },
  { key: "Company",        label: "Company" },
  { key: "sector",         label: "Sector" },
  { key: "TOTAL_SCORE",    label: "Score",      fmt: (v) => formatNumber(v, 4) },
  { key: "Quality",        label: "Quality",    fmt: (v) => v.toFixed(0) },
  { key: "Growth",         label: "Growth",     fmt: (v) => v.toFixed(0) },
  { key: "Value",          label: "Value",      fmt: (v) => v.toFixed(0) },
  { key: "Momentum",       label: "Momentum",   fmt: (v) => v.toFixed(0) },
];

function downloadCSV(filename: string, data: Record<string, unknown>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function getSafeValue(obj: Record<string, unknown>, key: string): unknown {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const lk = key.toLowerCase();
  for (const k in obj) { if (k.toLowerCase() === lk) return obj[k]; }
  return undefined;
}

// Score banding label (mirrors image "STRONG OUTPERFORM" pattern)
function scoreBand(percentile: number): { label: string; color: string } {
  if (percentile >= 80) return { label: "STRONG OUTPERFORM", color: "var(--green)" };
  if (percentile >= 60) return { label: "OUTPERFORM",        color: "var(--green)" };
  if (percentile >= 40) return { label: "MARKET PERFORM",    color: "var(--t2)" };
  if (percentile >= 20) return { label: "UNDERPERFORM",      color: "var(--orange)" };
  return                       { label: "STRONG UNDERPERFORM", color: "var(--red)" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ScorerPage() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { mode, recommendations, openProfileModal } = useInvestorMode();
  const isSimple = mode === "simple";
  const isDark = theme === "dark";

  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(WEIGHT_DEFS.map((w) => [w.key, w.defaultVal]))
  );
  const [activePreset, setActivePreset] = useState<string>("balanced");
  const [showCustom, setShowCustom]     = useState(false);
  const [result, setResult]             = useState<ScorerResult | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>("All");
  const [sortKey, setSortKey]           = useState<string | null>("TOTAL_SCORE");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");
  const [companySearch, setCompanySearch] = useState("");
  const [showCompanyDrop, setShowCompanyDrop] = useState(false);

  const defaultScores = useQuery<ScorerResult>({
    queryKey: ["scorer-latest"],
    queryFn: () => get("/scorer/latest"),
    retry: false,
    staleTime: 300_000,
  });

  const runScorer = useMutation({
    mutationFn: () => post<ScorerResult>("/scorer/run", { weights }),
    onSuccess: (data) => {
      setResult(data);
      const first = data.assets?.[0];
      if (first) setSelectedTicker(String(getSafeValue(first as Record<string, unknown>, "ticker") ?? ""));
      toast.success(`Scoring complete — ${data.count} assets ranked.`);
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      console.error("[scorer]", err);
      toast.error(errMsg(err?.response?.data?.detail ?? err?.message));
    },
  });

  const total   = Object.values(weights).reduce((s, v) => s + v, 0);
  const totalOk = Math.abs(total - 1.0) <= 0.01;

  const applyPreset = (preset: ScoringPreset) => {
    setWeights({ ...preset.weights });
    setActivePreset(preset.id);
    setShowCustom(false);
  };

  const handleSliderChange = (key: string, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val / 100 }));
    setActivePreset("custom");
  };

  const displayData = result ?? defaultScores.data;
  const assets      = (displayData?.assets ?? []) as Record<string, unknown>[];

  // Compute factor sub-scores normalized to 0-100 within universe
  const enriched = useMemo(() => {
    if (!assets.length) return [] as Record<string, unknown>[];
    const ranges: Record<string, { min: number; max: number }> = {};
    const allKeys = new Set<string>();
    for (const sf of SUB_FACTORS) sf.sources.forEach(s => allKeys.add(s));
    for (const k of allKeys) {
      const vals = assets.map(a => Number(getSafeValue(a, k) ?? NaN)).filter(v => !isNaN(v) && isFinite(v));
      if (vals.length) ranges[k] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return assets.map(a => {
      const subs: Record<string, number> = {};
      for (const sf of SUB_FACTORS) {
        const xs: number[] = [];
        for (const src of sf.sources) {
          const v = Number(getSafeValue(a, src) ?? NaN);
          const r = ranges[src];
          if (!isNaN(v) && r && r.max > r.min) {
            let n = (v - r.min) / (r.max - r.min);
            if (sf.inverse) n = 1 - n;
            xs.push(n * 100);
          }
        }
        subs[sf.key] = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 50;
      }
      return { ...a, ...subs };
    });
  }, [assets]);

  const availableSectors = useMemo(() => {
    if (!enriched.length) return [];
    const sectors = new Set(enriched.map(a => String(getSafeValue(a, "sector") ?? "Unknown")));
    return ["All", ...Array.from(sectors).filter(s => s !== "Unknown").sort()];
  }, [enriched]);

  const companyOptions = useMemo(() => {
    if (!enriched.length) return [];
    const q = companySearch.trim().toLowerCase();
    return enriched
      .map(a => ({
        ticker: String(getSafeValue(a, "ticker") ?? ""),
        name:   String(getSafeValue(a, "name") ?? getSafeValue(a, "Name") ?? getSafeValue(a, "Company") ?? ""),
        score:  Number(getSafeValue(a, "TOTAL_SCORE") ?? 0),
      }))
      .filter(o => !q || o.ticker.toLowerCase().includes(q) || o.name.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, [enriched, companySearch]);

  const sortedFilteredAssets = useMemo(() => {
    const filtered = sectorFilter === "All" ? enriched : enriched.filter(a => getSafeValue(a, "sector") === sectorFilter);
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = parseFloat(String(getSafeValue(a, sortKey) ?? 0)) || 0;
      const bv = parseFloat(String(getSafeValue(b, sortKey) ?? 0)) || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [enriched, sectorFilter, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const activeAsset  = enriched.find(a => getSafeValue(a, "ticker") === selectedTicker) ?? enriched[0] ?? null;
  const activeTicker = activeAsset ? String(getSafeValue(activeAsset, "ticker") ?? "") : null;
  const activeName   = activeAsset ? String(getSafeValue(activeAsset, "name") ?? getSafeValue(activeAsset, "Name") ?? activeTicker ?? "") : "";
  const activeSector = activeAsset ? String(getSafeValue(activeAsset, "sector") ?? "") : "";
  const activeScore  = activeAsset ? Number(getSafeValue(activeAsset, "TOTAL_SCORE") ?? 0) : 0;

  // Universe rank + percentile
  const universeRank = useMemo(() => {
    const sorted = [...enriched].sort((a, b) => Number(getSafeValue(b, "TOTAL_SCORE") ?? 0) - Number(getSafeValue(a, "TOTAL_SCORE") ?? 0));
    const idx = sorted.findIndex(a => getSafeValue(a, "ticker") === activeTicker);
    return { rank: idx + 1, total: sorted.length, percentile: enriched.length > 1 ? ((sorted.length - idx) / sorted.length) * 100 : 50 };
  }, [enriched, activeTicker]);

  // Sector peer rank
  const sectorPeers = useMemo(() => {
    if (!activeSector) return { rank: 0, total: 0 };
    const peers = enriched.filter(a => getSafeValue(a, "sector") === activeSector)
      .sort((a, b) => Number(getSafeValue(b, "TOTAL_SCORE") ?? 0) - Number(getSafeValue(a, "TOTAL_SCORE") ?? 0));
    const idx = peers.findIndex(a => getSafeValue(a, "ticker") === activeTicker);
    return { rank: idx + 1, total: peers.length };
  }, [enriched, activeSector, activeTicker]);

  const subScoresActive = useMemo(() => {
    if (!activeAsset) return {};
    return Object.fromEntries(SUB_FACTORS.map(sf => [sf.key, Number(getSafeValue(activeAsset, sf.key) ?? 0)]));
  }, [activeAsset]);

  const band = scoreBand(universeRank.percentile);

  // Radar — active vs benchmark (universe median)
  const radarFactors = SUB_FACTORS.map(sf => sf.key);
  const radarLabels  = SUB_FACTORS.map(sf => sf.label);
  const benchmarkVals = useMemo(() => SUB_FACTORS.map(sf => {
    const xs = enriched.map(a => Number(getSafeValue(a, sf.key) ?? NaN)).filter(v => !isNaN(v));
    if (!xs.length) return 50;
    const sorted = xs.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }), [enriched]);
  const activeVals = radarFactors.map(k => Number(subScoresActive[k] ?? 0));

  const gridCol  = isDark ? "rgba(180,197,255,0.06)" : "rgba(0,0,0,0.06)";
  const labelCol = isDark ? "rgba(245,245,245,0.45)" : "rgba(17,17,17,0.50)";

  const radarData = activeVals.length ? [
    {
      type: "scatterpolar" as const,
      r: [...benchmarkVals, benchmarkVals[0]],
      theta: [...radarLabels, radarLabels[0]],
      name: "S&P 500",
      fill: "toself" as const,
      fillcolor: "rgba(148,163,184,0.10)",
      line: { color: "#94A3B8", width: 1, dash: "dot" as const },
      marker: { size: 0 },
      hovertemplate: "S&P %{theta}: %{r:.0f}<extra></extra>",
    },
    {
      type: "scatterpolar" as const,
      r: [...activeVals, activeVals[0]],
      theta: [...radarLabels, radarLabels[0]],
      name: activeTicker || "Active",
      fill: "toself" as const,
      fillcolor: "rgba(0,74,198,0.10)",
      line: { color: "#004AC6", width: 1.6 },
      marker: { size: 3, color: "#004AC6" },
      hovertemplate: "%{theta}: %{r:.0f}<extra></extra>",
    },
  ] : [];

  const radarLayout = {
    polar: {
      radialaxis: { visible: true, range: [0, 100], showticklabels: false, gridcolor: gridCol, linecolor: gridCol },
      angularaxis: { tickfont: { size: 9, color: labelCol }, gridcolor: gridCol, linecolor: gridCol },
      bgcolor: "transparent",
    },
    margin: { t: 20, b: 20, l: 40, r: 40 },
    showlegend: false,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
  };

  // Top-N bar chart of composite scores (replaces "Score Evolution" — historical scores not stored)
  const topN = useMemo(() => sortedFilteredAssets.slice(0, 12), [sortedFilteredAssets]);
  const topBarData = topN.length ? [{
    type: "bar" as const,
    x: topN.map(a => String(getSafeValue(a, "ticker"))),
    y: topN.map(a => Number(getSafeValue(a, "TOTAL_SCORE") ?? 0)),
    marker: {
      color: topN.map(a => getSafeValue(a, "ticker") === activeTicker ? "#004AC6" : "#B4C5FF"),
    },
    hovertemplate: "%{x}: %{y:.3f}<extra></extra>",
  }] : [];
  const topBarLayout = {
    margin: { t: 12, b: 36, l: 40, r: 12 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    showlegend: false,
    xaxis: { tickfont: { size: 9, color: labelCol }, showgrid: false },
    yaxis: { showgrid: true, gridcolor: gridCol, tickfont: { size: 9, color: labelCol } },
  };

  const currentPreset = SCORING_PRESETS.find(p => p.id === activePreset);

  return (
    <ErrorBoundary>
      <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>

        {/* ── HEADER + STRATEGY PILLS + RECALCULATE ── */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22 }}>
          <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.06em", color: "var(--t3)", marginBottom: 4 }}>
              {t.scorer.breadcrumb}
            </p>
            <h1 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
              {t.scorer.pageTitle}
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--t3)", marginTop: 4, maxWidth: 580 }}>
              {t.scorer.subtitle}
            </p>
          </div>

          {!isSimple && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {/* Strategy pills */}
              <div style={{ display: "inline-flex", alignItems: "center", padding: 3, borderRadius: "9999px", background: "var(--bg-card)", border: "1px solid var(--card-border)" }}>
                {SCORING_PRESETS.slice(0, 3).map(preset => {
                  const active = activePreset === preset.id;
                  return (
                    <button key={preset.id} onClick={() => applyPreset(preset)}
                      style={{
                        fontSize: "0.74rem", fontWeight: 600,
                        padding: "5px 14px",
                        borderRadius: "9999px",
                        background: active ? "var(--orange)" : "transparent",
                        color: active ? "#fff" : "var(--t2)",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.12s",
                      }}>
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* "More" presets dropdown via inline selector */}
              {SCORING_PRESETS.length > 3 && (
                <select value={activePreset} onChange={e => {
                  const p = SCORING_PRESETS.find(x => x.id === e.target.value);
                  if (p) applyPreset(p);
                }}
                  style={{ fontSize: "0.74rem", padding: "6px 10px", background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-md)", color: "var(--t2)", cursor: "pointer" }}>
                  <option value="" disabled>Plus…</option>
                  {SCORING_PRESETS.slice(3).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  <option value="custom" disabled={activePreset !== "custom"}>Custom</option>
                </select>
              )}

              {/* Recalculate */}
              <button
                onClick={() => runScorer.mutate()}
                disabled={runScorer.isPending || !totalOk}
                className="btn-primary"
              >
                {runScorer.isPending ? <LoadingSpinner size="sm" /> : <RefreshCw size={12} />}
                {runScorer.isPending ? "Scoring…" : "Recalculate"}
              </button>
            </div>
          )}
        </div>

        {/* ── SIMPLE MODE: full-width strategy cards ── */}
        {isSimple && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: "0.78rem", color: "var(--t3)" }}>Pick a strategy — we rank stocks automatically.</p>
              <button onClick={openProfileModal}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "7px 14px", fontSize: "0.75rem", color: "var(--t2)", cursor: "pointer" }}>
                <Sparkles size={11} /> Update profile
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {SCORING_PRESETS.map(preset => {
                const isRec    = recommendations?.scorerPreset === preset.id;
                const isActive = activePreset === preset.id;
                return (
                  <button key={preset.id} onClick={() => { applyPreset(preset); runScorer.mutate(); }}
                    style={{ textAlign: "left", padding: "16px 18px", borderRadius: "var(--r-xl)",
                      border: `1px solid ${isActive ? "var(--orange)" : isRec ? "rgba(0,74,198,0.3)" : "var(--card-border)"}`,
                      background: isActive ? "var(--orange-dim)" : "var(--bg-card)",
                      cursor: "pointer", position: "relative", transition: "all 0.12s" }}
                  >
                    {isRec && (
                      <span style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 3, background: "var(--orange)", color: "#fff", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.06em", borderRadius: "9999px", padding: "2px 8px" }}>
                        <Sparkles size={7} /> FOR YOU
                      </span>
                    )}
                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: isActive ? "var(--orange)" : "var(--t1)", marginBottom: 4 }}>{preset.label}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--t3)", lineHeight: 1.5 }}>{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ADVANCED: Custom Weights collapsible ── */}
        {!isSimple && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden", marginBottom: 18 }}>
            <button type="button" onClick={() => setShowCustom(o => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sliders size={13} style={{ color: "var(--orange)" }} />
                <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.82rem", fontWeight: 600, color: "var(--t1)" }}>Custom Weights</span>
                <span style={{
                  fontSize: "0.6rem", fontWeight: 700, padding: "1px 8px", borderRadius: "9999px",
                  background: totalOk ? "rgba(134,179,138,0.15)" : "var(--orange-dim)",
                  color: totalOk ? "var(--green)" : "var(--orange)",
                  border: `1px solid ${totalOk ? "rgba(134,179,138,0.3)" : "var(--orange-border)"}`,
                }}>
                  {(total * 100).toFixed(0)}% {totalOk ? "✓" : "≠ 100%"}
                </span>
                {activePreset === "custom" && (
                  <span style={{ fontSize: "0.62rem", color: "var(--t3)", padding: "1px 8px", borderRadius: "9999px", background: "var(--bg-inner)" }}>custom</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {showCustom && (
                  <button onClick={e => { e.stopPropagation(); applyPreset(SCORING_PRESETS.find(x => x.id === "balanced")!); }}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "3px 10px", fontSize: "0.68rem", color: "var(--t3)", cursor: "pointer" }}>
                    <RotateCcw size={10} /> Reset
                  </button>
                )}
                {showCustom ? <ChevronUp size={13} style={{ color: "var(--t3)" }} /> : <ChevronDown size={13} style={{ color: "var(--t3)" }} />}
              </div>
            </button>

            {showCustom && (
              <div style={{ borderTop: "1px solid var(--card-border)", padding: "16px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 32px" }}>
                  {GROUPS.map(group => (
                    <div key={group}>
                      <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--t3)", paddingBottom: 8, borderBottom: "1px solid var(--card-border)", marginBottom: 12 }}>
                        {group}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {WEIGHT_DEFS.filter(w => w.group === group).map(w => (
                          <div key={w.key}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                              <div>
                                <span style={{ fontSize: "0.74rem", color: "var(--t1)" }}>{w.label}</span>
                                <span style={{ fontSize: "0.62rem", color: "var(--t3)", marginLeft: 6 }}>{w.hint}</span>
                              </div>
                              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: weights[w.key] > 0 ? "var(--orange)" : "var(--t3)" }}>
                                {(weights[w.key] * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ position: "relative", height: 2, background: "var(--bg-inner)", borderRadius: 2, marginBottom: 5 }}>
                              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${weights[w.key] * 100}%`, background: "var(--orange)", borderRadius: 2, transition: "width 0.1s" }} />
                            </div>
                            <input
                              type="range" min={0} max={100} step={1}
                              value={weights[w.key] * 100}
                              onChange={e => handleSliderChange(w.key, parseFloat(e.target.value))}
                              style={{ width: "100%", margin: 0 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COMPANY SELECTOR ── */}
        {enriched.length > 0 && (
          <div style={{ position: "relative", marginBottom: 18, maxWidth: 480 }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--bg-card)", border: "1px solid var(--card-border)",
                borderRadius: "var(--r-xl)", padding: "8px 14px",
                cursor: "pointer",
              }}
              onClick={() => setShowCompanyDrop(v => !v)}
            >
              {activeTicker && <TickerLogo ticker={activeTicker} size={22} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 1 }}>
                  Analyser l&apos;entreprise
                </p>
                <p style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeName || activeTicker || "Sélectionner…"}
                  {activeTicker && <span style={{ color: "var(--t3)", fontWeight: 400, marginLeft: 6, fontSize: "0.78rem" }}>{activeTicker}</span>}
                </p>
              </div>
              <ChevronDown size={13} style={{ color: "var(--t3)", flexShrink: 0, transform: showCompanyDrop ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </div>

            {showCompanyDrop && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                  background: "var(--bg-surface)", border: "1px solid var(--card-border)",
                  borderRadius: "var(--r-xl)", zIndex: 50,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
                  overflow: "hidden",
                  minWidth: 360,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--card-border)" }}>
                  <Search size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
                  <input
                    autoFocus
                    value={companySearch}
                    onChange={e => setCompanySearch(e.target.value)}
                    placeholder="Rechercher par ticker ou nom…"
                    style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.8rem", color: "var(--t1)" }}
                  />
                  {companySearch && (
                    <button onClick={() => setCompanySearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 0 }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {companyOptions.map(opt => (
                    <button
                      key={opt.ticker}
                      onClick={() => { setSelectedTicker(opt.ticker); setShowCompanyDrop(false); setCompanySearch(""); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 14px", background: opt.ticker === activeTicker ? "var(--bg-inner)" : "transparent",
                        border: "none", cursor: "pointer", textAlign: "left",
                        borderBottom: "1px solid var(--card-border)",
                      }}
                      onMouseEnter={e => { if (opt.ticker !== activeTicker) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                      onMouseLeave={e => { if (opt.ticker !== activeTicker) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <TickerLogo ticker={opt.ticker} size={20} />
                      <span style={{ flex: 1, fontSize: "0.8rem", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {opt.name || opt.ticker}
                      </span>
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--t3)", flexShrink: 0, marginRight: 8 }}>{opt.ticker}</span>
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, color: opt.score > 0 ? "var(--orange)" : "var(--t3)", background: "var(--bg-inner)", padding: "1px 7px", borderRadius: "9999px", flexShrink: 0 }}>
                        {opt.score.toFixed(3)}
                      </span>
                    </button>
                  ))}
                  {companyOptions.length === 0 && (
                    <div style={{ padding: "14px", fontSize: "0.75rem", color: "var(--t3)" }}>Aucun résultat</div>
                  )}
                </div>
              </div>
            )}

            {showCompanyDrop && (
              <div
                style={{ position: "fixed", inset: 0, zIndex: 49 }}
                onClick={() => { setShowCompanyDrop(false); setCompanySearch(""); }}
              />
            )}
          </div>
        )}

        {/* ── HERO: Composite Score + Factor Decomposition ── */}
        {runScorer.isPending && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <LoadingSpinner label="Computing Z-scores…" size="lg" />
          </div>
        )}

        {defaultScores.isLoading && !displayData && !runScorer.isPending && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <SkeletonChart height={260} />
            <SkeletonChart height={260} />
          </div>
        )}

        {!runScorer.isPending && activeAsset && (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 14, marginBottom: 14 }}>

              {/* Composite Score */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
                    Score composite global
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TickerLogo ticker={activeTicker || ""} size={32} />
                    <h2 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.01em" }}>
                      {activeName} <span style={{ color: "var(--t3)", fontWeight: 500, fontSize: "0.85rem" }}>({activeTicker})</span>
                    </h2>
                  </div>
                </div>

                {/* Donut gauge */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "10px 0" }}>
                  <CircularGauge value={universeRank.percentile} size={180} stroke={16} />
                </div>

                <p style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", color: band.color, textAlign: "center", textTransform: "uppercase" }}>
                  {band.label}
                </p>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
                  <div>
                    <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>Sector Rank</p>
                    <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--t1)", marginTop: 2 }}>
                      {sectorPeers.total > 0 ? `#${sectorPeers.rank}/${sectorPeers.total}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>Score brut</p>
                    <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--t1)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {activeScore.toFixed(3)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>Volatility</p>
                    <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--t1)", marginTop: 2 }}>
                      {(() => {
                        const v = Number(getSafeValue(activeAsset, "Vol_Ann") ?? 0) * 100;
                        if (v > 35) return "High";
                        if (v > 22) return "Med-High";
                        if (v > 15) return "Medium";
                        return "Low";
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Factor Decomposition */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "20px 24px" }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 16 }}>
                  Décomposition par facteur
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {SUB_FACTORS.map(sf => {
                    const v = Number(subScoresActive[sf.key] ?? 0);
                    return (
                      <div key={sf.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                          <span style={{ fontSize: "0.84rem", color: "var(--t1)", fontWeight: 500 }}>{sf.label} Score</span>
                          <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.84rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums" }}>
                            {v.toFixed(0)}<span style={{ color: "var(--t3)", fontWeight: 500 }}>/100</span>
                          </span>
                        </div>
                        <div style={{ position: "relative", height: 6, background: "var(--bg-inner)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${Math.max(0, Math.min(100, v))}%`,
                            background: v >= 70 ? "var(--green)" : v >= 50 ? "var(--orange)" : "var(--red)",
                            borderRadius: 3,
                            transition: "width 0.4s ease",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ── 2-col: Radar + Top-12 bars ── */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14, marginBottom: 14 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div>
                    <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--t3)" }}>Profil factoriel</p>
                    <p style={{ fontSize: "0.7rem", color: "var(--t3)", marginTop: 2 }}>Asset vs. univers (médiane)</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.62rem", color: "var(--orange)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#004AC6" }} />
                      {activeTicker}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.62rem", color: "var(--t3)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94A3B8" }} />
                      Médiane
                    </span>
                  </div>
                </div>
                {radarData.length ? (
                  <PlotlyChart data={radarData} layout={radarLayout} height={260} />
                ) : (
                  <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: "0.78rem" }}>No data</div>
                )}
              </div>

              <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--t3)" }}>Top 12 — score composite</p>
                    <p style={{ fontSize: "0.7rem", color: "var(--t3)", marginTop: 2 }}>Univers filtré · sélection mise en avant</p>
                  </div>
                  {currentPreset && activePreset !== "custom" && (
                    <span style={{ fontSize: "0.62rem", color: "var(--orange)", fontWeight: 600 }}>{currentPreset.label}</span>
                  )}
                </div>
                {topBarData.length ? (
                  <PlotlyChart data={topBarData} layout={topBarLayout} height={260} />
                ) : (
                  <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: "0.78rem" }}>No data</div>
                )}
              </div>
            </section>

            {/* ── Stats strip 3-col ── */}
            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: 14, background: isDark ? "rgba(11,28,51,0.7)" : "#0F172A", borderRadius: "var(--r-xl)", overflow: "hidden", color: "#fff" }}>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(180,197,255,0.6)", marginBottom: 6 }}>
                  Percentile global
                </p>
                <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.85rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1 }}>
                  {universeRank.percentile.toFixed(1)}<span style={{ fontSize: "0.85rem", color: "rgba(180,197,255,0.6)" }}>/100</span>
                </p>
                <p style={{ fontSize: "0.7rem", color: "rgba(180,197,255,0.6)", marginTop: 6 }}>
                  Mieux classé que {universeRank.percentile.toFixed(1)}% de l&apos;univers ({universeRank.total} actifs)
                </p>
              </div>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(180,197,255,0.6)", marginBottom: 6 }}>
                  Rang sectoriel
                </p>
                <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.85rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1 }}>
                  #{sectorPeers.rank}<span style={{ fontSize: "0.85rem", color: "rgba(180,197,255,0.6)" }}> / {sectorPeers.total}</span>
                </p>
                <p style={{ fontSize: "0.7rem", color: "rgba(180,197,255,0.6)", marginTop: 6 }}>
                  Position dans le secteur {activeSector || "—"}
                </p>
              </div>
              <div style={{ padding: "18px 24px" }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(180,197,255,0.6)", marginBottom: 6 }}>
                  Écart vs. médiane
                </p>
                <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.85rem", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: universeRank.percentile >= 50 ? "#86B38A" : "#D48585" }}>
                  {universeRank.percentile >= 50 ? "+" : ""}{(universeRank.percentile - 50).toFixed(1)}%
                </p>
                <p style={{ fontSize: "0.7rem", color: "rgba(180,197,255,0.6)", marginTop: 6 }}>
                  Le moteur indique un{universeRank.percentile >= 50 ? " avantage" : " désavantage"} significatif vs. l&apos;univers
                </p>
              </div>
            </section>

            {/* ── Comprehensive Factor Database ── */}
            <section style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--card-border)" }}>
                <h3 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.92rem", fontWeight: 700, color: "var(--t1)" }}>Base de facteurs · {displayData?.count ?? assets.length} actifs</h3>
                <button onClick={() => downloadCSV("scorer_results.csv", enriched)}
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "4px 10px", fontSize: "0.7rem", color: "var(--t3)", cursor: "pointer" }}>
                  <Download size={11} /> CSV
                </button>
              </div>

              {availableSectors.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 20px", borderBottom: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                  <span style={{ fontSize: "0.62rem", color: "var(--t3)", marginRight: 2 }}>Sector</span>
                  {availableSectors.map(s => (
                    <button key={s} onClick={() => setSectorFilter(s)}
                      style={{ fontSize: "0.65rem", fontWeight: 500, padding: "3px 10px", borderRadius: "9999px", border: `1px solid ${sectorFilter === s ? "var(--orange-border)" : "var(--card-border)"}`, background: sectorFilter === s ? "var(--orange-dim)" : "transparent", color: sectorFilter === s ? "var(--orange)" : "var(--t3)", cursor: "pointer" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                      {RESULT_COLS.map(col => {
                        const sortable = !["ticker", "Company", "sector"].includes(col.key);
                        return (
                          <th key={col.key} onClick={() => sortable && handleSort(col.key)}
                            style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", cursor: sortable ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {col.label}
                              {sortKey === col.key && (sortDir === "desc" ? <ChevronDown size={9} /> : <ChevronUp size={9} />)}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFilteredAssets.slice(0, 50).map((asset, rowIdx) => {
                      const tk    = String(getSafeValue(asset, "ticker") ?? "");
                      const isAct = tk === activeTicker;
                      const sector = String(getSafeValue(asset, "sector") ?? "");
                      const score  = Number(getSafeValue(asset, "TOTAL_SCORE") ?? 0);
                      const company = String(getSafeValue(asset, "name") ?? getSafeValue(asset, "Name") ?? getSafeValue(asset, "description") ?? "");
                      return (
                        <tr key={tk} onClick={() => setSelectedTicker(tk)}
                          style={{ borderBottom: "1px solid var(--card-border)", background: isAct ? "var(--orange-dim)" : rowIdx % 2 === 0 ? "var(--bg-card)" : "var(--bg-inner)", cursor: "pointer" }}
                          onMouseEnter={e => { if (!isAct) (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-hover)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isAct ? "var(--orange-dim)" : rowIdx % 2 === 0 ? "var(--bg-card)" : "var(--bg-inner)"; }}
                        >
                          <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                            <Link href={`/equity?ticker=${encodeURIComponent(tk)}`} onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                              <TickerLogo ticker={tk} size={28} />
                              <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.84rem", fontWeight: 700, color: "var(--orange)" }}>{tk}</span>
                            </Link>
                          </td>
                          <td style={{ padding: "10px 16px", color: "var(--t1)", fontSize: "0.78rem", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {company || "—"}
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            {sector ? (
                              <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 9px", borderRadius: "var(--r-sm)", background: "var(--bg-inner)", color: "var(--t2)", border: "1px solid var(--card-border)", whiteSpace: "nowrap" }}>
                                {sector}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{
                              display: "inline-block", minWidth: 44, textAlign: "center",
                              fontFamily: "Manrope, sans-serif", fontSize: "0.78rem", fontWeight: 700,
                              padding: "3px 10px", borderRadius: "9999px",
                              background: "var(--orange-dim)", color: "var(--orange)",
                              border: "1px solid var(--orange-border)",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {score.toFixed(2)}
                            </span>
                          </td>
                          {(["Quality", "Growth", "Value", "Momentum"]).map(k => {
                            const v = Number(getSafeValue(asset, k) ?? 0);
                            const low = v < 50;
                            return (
                              <td key={k} style={{ padding: "10px 16px", fontFamily: "Manrope, sans-serif", fontSize: "0.78rem", fontWeight: 600, color: low ? "var(--red)" : "var(--t1)", fontVariantNumeric: "tabular-nums" }}>
                                {v.toFixed(0)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {sortedFilteredAssets.length > 50 && (
                <div style={{ padding: "12px 20px", textAlign: "center", borderTop: "1px solid var(--card-border)", background: "var(--bg-inner)", fontSize: "0.72rem", color: "var(--t3)" }}>
                  Affichage de 50 / {sortedFilteredAssets.length} · filtrez par secteur pour affiner
                </div>
              )}
            </section>
          </>
        )}

        {!runScorer.isPending && !displayData && !defaultScores.isLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 240, gap: 12, background: "var(--bg-card)", border: "1.5px dashed var(--card-border)", borderRadius: "var(--r-xl)", textAlign: "center" }}>
            <Play size={22} style={{ color: "var(--t3)" }} />
            <p style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--t1)" }}>Aucun score</p>
            <p style={{ fontSize: "0.74rem", color: "var(--t3)" }}>Choisissez une stratégie ci-dessus puis lancez le calcul.</p>
            <button onClick={() => runScorer.mutate()} disabled={runScorer.isPending || !totalOk} className="btn-primary">
              <RefreshCw size={12} /> Recalculate
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Circular gauge — pure SVG, no library
// ---------------------------------------------------------------------------
function CircularGauge({ value, size = 180, stroke = 16 }: { value: number; size?: number; stroke?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const color = v >= 70 ? "var(--green)" : v >= 40 ? "var(--orange)" : "var(--red)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inner)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="50%" y="50%" dy="-2"
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: size * 0.30, fontWeight: 700, fill: "var(--t1)" }}>
        {Math.round(v)}
      </text>
      <text x="50%" y="50%" dy={size * 0.18}
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.06, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", fill: "var(--t3)" }}>
        / 100
      </text>
    </svg>
  );
}
