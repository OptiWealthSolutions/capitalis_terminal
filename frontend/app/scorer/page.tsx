"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import type { ScorerResult } from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonBlock, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Play, RotateCcw, ChevronRight, Sliders } from "lucide-react";
import toast from "react-hot-toast";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Weight definitions
// ---------------------------------------------------------------------------
interface WeightEntry { key: string; label: string; defaultVal: number; group: string; hint: string }

const WEIGHT_DEFS: WeightEntry[] = [
  { key: "F_Score",            label: "F-Score (Piotroski)",   defaultVal: 0.25, group: "Quality",         hint: "9-point financial strength score" },
  { key: "returnOnEquity",     label: "Return on Equity",      defaultVal: 0.10, group: "Quality",         hint: "Net income / shareholders equity" },
  { key: "earningsGrowth",     label: "Earnings Growth",       defaultVal: 0.10, group: "Quality",         hint: "YoY EPS diluted growth" },
  { key: "trailingPE",         label: "Trailing P/E (inv.)",   defaultVal: 0.20, group: "Valuation",       hint: "Lower P/E = higher score" },
  { key: "pct_undervaluation", label: "Graham Undervaluation", defaultVal: 0.05, group: "Valuation",       hint: "Discount to Graham intrinsic value" },
  { key: "Sharpe",             label: "Sharpe Ratio",          defaultVal: 0.20, group: "Risk / Return",   hint: "Risk-adjusted excess return" },
  { key: "Sortino",            label: "Sortino Ratio",         defaultVal: 0.00, group: "Risk / Return",   hint: "Downside risk-adjusted return" },
  { key: "CAGR",               label: "CAGR",                  defaultVal: 0.05, group: "Risk / Return",   hint: "Compound annual growth rate" },
  { key: "Vol_Ann",            label: "Volatility (inv.)",     defaultVal: 0.05, group: "Risk / Return",   hint: "Lower volatility = higher score" },
];

const GROUPS = ["Quality", "Valuation", "Risk / Return"];

// ---------------------------------------------------------------------------
// Scoring presets
// ---------------------------------------------------------------------------
interface ScoringPreset {
  id: string;
  label: string;
  description: string;
  weights: Record<string, number>;
}

const SCORING_PRESETS: ScoringPreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Equal weight across quality, value and momentum",
    weights: { F_Score: 0.25, returnOnEquity: 0.10, earningsGrowth: 0.05, trailingPE: 0.15, pct_undervaluation: 0.05, Sharpe: 0.20, Sortino: 0.05, CAGR: 0.10, Vol_Ann: 0.05 },
  },
  {
    id: "growth",
    label: "Growth",
    description: "Prioritises earnings momentum and CAGR over valuation",
    weights: { F_Score: 0.10, returnOnEquity: 0.15, earningsGrowth: 0.25, trailingPE: 0.05, pct_undervaluation: 0.00, Sharpe: 0.15, Sortino: 0.05, CAGR: 0.20, Vol_Ann: 0.05 },
  },
  {
    id: "value",
    label: "Deep Value",
    description: "Undervalued stocks with low P/E and Graham margin of safety",
    weights: { F_Score: 0.20, returnOnEquity: 0.05, earningsGrowth: 0.05, trailingPE: 0.30, pct_undervaluation: 0.20, Sharpe: 0.10, Sortino: 0.00, CAGR: 0.05, Vol_Ann: 0.05 },
  },
  {
    id: "quality",
    label: "Quality",
    description: "High F-Score, strong ROE — avoids speculative names",
    weights: { F_Score: 0.40, returnOnEquity: 0.20, earningsGrowth: 0.10, trailingPE: 0.10, pct_undervaluation: 0.00, Sharpe: 0.10, Sortino: 0.05, CAGR: 0.05, Vol_Ann: 0.00 },
  },
  {
    id: "momentum",
    label: "Momentum",
    description: "Recent performance and risk-adjusted returns dominate",
    weights: { F_Score: 0.05, returnOnEquity: 0.05, earningsGrowth: 0.10, trailingPE: 0.05, pct_undervaluation: 0.00, Sharpe: 0.35, Sortino: 0.10, CAGR: 0.25, Vol_Ann: 0.05 },
  },
  {
    id: "conservative",
    label: "Conservative",
    description: "Low volatility, stable fundamentals, capital preservation",
    weights: { F_Score: 0.20, returnOnEquity: 0.10, earningsGrowth: 0.00, trailingPE: 0.15, pct_undervaluation: 0.10, Sharpe: 0.20, Sortino: 0.10, CAGR: 0.05, Vol_Ann: 0.10 },
  },
];

// ---------------------------------------------------------------------------
// Radar / table config
// ---------------------------------------------------------------------------
const RADAR_FACTORS = [
  { key: "F_Score",            label: "F-Score",  inverse: false },
  { key: "returnOnEquity",     label: "ROE",      inverse: false },
  { key: "earningsGrowth",     label: "EPS Gr.",  inverse: false },
  { key: "trailingPE",         label: "P/E",      inverse: true  },
  { key: "pct_undervaluation", label: "Graham",   inverse: false },
  { key: "Sharpe",             label: "Sharpe",   inverse: false },
  { key: "CAGR",               label: "CAGR",     inverse: false },
  { key: "Vol_Ann",            label: "Vol",      inverse: true  },
];

const RESULT_COLS = [
  { key: "ticker",         label: "TICKER" },
  { key: "sector",         label: "SECTOR" },
  { key: "TOTAL_SCORE",    label: "SCORE",   fmt: (v: number) => formatNumber(v, 4) },
  { key: "F_Score",        label: "F-SCORE", fmt: (v: number) => formatNumber(v, 0) },
  { key: "returnOnEquity", label: "ROE",     fmt: formatPercent },
  { key: "Sharpe",         label: "SHARPE",  fmt: (v: number) => formatNumber(v, 3) },
  { key: "CAGR",           label: "CAGR",    fmt: formatPercent },
  { key: "Vol_Ann",        label: "VOL",     fmt: formatPercent },
];

function getSafeValue(obj: Record<string, unknown>, key: string): unknown {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const lk = key.toLowerCase();
  for (const k in obj) { if (k.toLowerCase() === lk) return obj[k]; }
  return undefined;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ScorerPage() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === "dark";

  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(WEIGHT_DEFS.map((w) => [w.key, w.defaultVal]))
  );
  const [activePreset, setActivePreset] = useState<string>("balanced");
  const [showCustom, setShowCustom] = useState(false);
  const [result, setResult] = useState<ScorerResult | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

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
      toast.error(`Scorer failed: ${err?.response?.data?.detail ?? err.message}`);
    },
  });

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
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

  const resetToPreset = () => {
    const defaultPreset = SCORING_PRESETS.find((p) => p.id === "balanced")!;
    applyPreset(defaultPreset);
  };

  const displayData = result ?? defaultScores.data;
  const assets = (displayData?.assets ?? []) as Record<string, unknown>[];

  const normalized = useMemo(() => {
    if (!assets.length) return {} as Record<string, Record<string, number>>;
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const f of RADAR_FACTORS) {
      const vals = assets.map((a) => Number(getSafeValue(a, f.key) ?? 0)).filter((v) => !isNaN(v));
      ranges[f.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    const out: Record<string, Record<string, number>> = {};
    for (const a of assets) {
      const t = String(getSafeValue(a, "ticker") ?? "");
      out[t] = {};
      for (const f of RADAR_FACTORS) {
        const { min, max } = ranges[f.key];
        let v = max === min ? 0.5 : (Number(getSafeValue(a, f.key) ?? min) - min) / (max - min);
        if (f.inverse) v = 1 - v;
        out[t][f.key] = Math.max(0, Math.min(1, v));
      }
    }
    return out;
  }, [assets]);

  const activeAsset = assets.find((a) => getSafeValue(a, "ticker") === selectedTicker) ?? assets[0] ?? null;
  const activeTicker = activeAsset ? String(getSafeValue(activeAsset, "ticker") ?? "") : null;
  const radarNorm = activeTicker && normalized[activeTicker] ? normalized[activeTicker] : null;
  const radarVals = radarNorm ? RADAR_FACTORS.map((f) => radarNorm[f.key]) : [];
  const radarLabels = RADAR_FACTORS.map((f) => f.label);

  const radarData = radarVals.length ? [{
    type: "scatterpolar" as const,
    r: [...radarVals, radarVals[0]],
    theta: [...radarLabels, radarLabels[0]],
    fill: "toself" as const,
    fillcolor: "rgba(122,167,232,0.10)",
    line: { color: "#7AA7E8", width: 1.5 },
    marker: { size: 3, color: "#7AA7E8" },
    hovertemplate: "%{theta}: %{r:.2f}<extra></extra>",
  }] : [];

  const gridCol  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const labelCol = isDark ? "rgba(245,245,245,0.50)" : "rgba(17,17,17,0.55)";

  const radarLayout = {
    polar: {
      radialaxis: { visible: true, range: [0, 1], showticklabels: false, gridcolor: gridCol, linecolor: gridCol },
      angularaxis: { tickfont: { size: 9, color: labelCol }, gridcolor: gridCol, linecolor: gridCol },
      bgcolor: "transparent",
    },
    margin: { t: 28, b: 28, l: 48, r: 48 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
  };

  const currentPreset = SCORING_PRESETS.find((p) => p.id === activePreset);

  return (
    <ErrorBoundary>
      <div className="fade-in p-4 sm:p-6" style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 4 }}>
            {t.scorer.breadcrumb}
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--t1)", lineHeight: 1.2 }}>{t.scorer.pageTitle}</h1>
              <p style={{ color: "var(--t2)", fontSize: "0.8rem", marginTop: 5 }}>
                {t.scorer.subtitle}
              </p>
            </div>
            <button
              onClick={() => runScorer.mutate()}
              disabled={runScorer.isPending || !totalOk}
              className="btn-primary"
            >
              {runScorer.isPending ? <LoadingSpinner size="sm" /> : <Play size={13} />}
              {runScorer.isPending ? "SCORING…" : "RUN SCORER"}
            </button>
          </div>
        </div>

        {/* ── Scoring strategy selector ── */}
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--r)", padding: "20px 24px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 2 }}>
                Scoring Strategy
              </p>
              {currentPreset && activePreset !== "custom" && (
                <p style={{ fontSize: "0.75rem", color: "var(--t2)" }}>{currentPreset.description}</p>
              )}
              {activePreset === "custom" && (
                <p style={{ fontSize: "0.75rem", color: "var(--t2)" }}>Custom weights — adjust sliders below</p>
              )}
            </div>
            <button
              onClick={() => setShowCustom((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: showCustom ? "var(--orange-dim)" : "var(--bg-base)",
                border: `1px solid ${showCustom ? "var(--orange-border)" : "var(--border)"}`,
                borderRadius: "var(--r-sm)", padding: "5px 12px",
                color: showCustom ? "var(--orange)" : "var(--t2)",
                fontSize: "0.68rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              <Sliders size={11} />
              CUSTOM WEIGHTS
            </button>
          </div>

          {/* Preset grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {SCORING_PRESETS.map((preset) => {
              const isActive = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  style={{
                    padding: "12px 10px",
                    background: isActive ? "var(--orange-dim)" : "var(--bg-base)",
                    border: `1px solid ${isActive ? "var(--orange-border)" : "var(--border)"}`,
                    borderRadius: "var(--r-sm)",
                    cursor: "pointer", textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  <div style={{
                    fontSize: "0.72rem", fontWeight: 700,
                    color: isActive ? "var(--orange)" : "var(--t1)",
                    marginBottom: 4,
                  }}>
                    {preset.label}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--t3)", lineHeight: 1.4 }}>
                    {preset.description.split(" ").slice(0, 5).join(" ")}…
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom sliders — collapsible */}
          {showCustom && (
            <div style={{
              marginTop: 20, paddingTop: 20,
              borderTop: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)" }}>
                  Factor Weights
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Total pill */}
                  <div style={{
                    padding: "4px 12px",
                    background: totalOk ? "var(--green-dim)" : "var(--red-dim)",
                    border: `1px solid ${totalOk ? "rgba(134,179,138,0.25)" : "rgba(212,133,133,0.25)"}`,
                    borderRadius: "var(--r-sm)",
                    fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                    color: totalOk ? "var(--green)" : "var(--red)",
                  }}>
                    {(total * 100).toFixed(0)}% {totalOk ? "✓" : "≠ 100%"}
                  </div>
                  <button
                    onClick={resetToPreset}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex", alignItems: "center", gap: 4, fontSize: "0.68rem" }}
                  >
                    <RotateCcw size={10} />
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-0">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <p style={{
                      fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.10em",
                      textTransform: "uppercase", color: "var(--t3)",
                      paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 12,
                    }}>
                      {group}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {WEIGHT_DEFS.filter((w) => w.group === group).map((w) => (
                        <div key={w.key}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <div>
                              <span style={{ fontSize: "0.7rem", color: "var(--t1)" }}>{w.label}</span>
                              <span style={{ fontSize: "0.6rem", color: "var(--t3)", marginLeft: 6 }}>{w.hint}</span>
                            </div>
                            <span style={{
                              fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace",
                              fontWeight: 600, color: weights[w.key] > 0 ? "var(--t1)" : "var(--t3)",
                            }}>
                              {(weights[w.key] * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ position: "relative", height: 2, background: "var(--border)", borderRadius: 2, marginBottom: 4 }}>
                            <div style={{
                              position: "absolute", left: 0, top: 0, bottom: 0,
                              width: `${weights[w.key] * 100}%`,
                              background: "var(--orange)", borderRadius: 2, transition: "width 0.1s",
                            }} />
                          </div>
                          <input
                            type="range" min={0} max={100} step={1}
                            value={weights[w.key] * 100}
                            onChange={(e) => handleSliderChange(w.key, parseFloat(e.target.value))}
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

        {/* ── Results area ── */}
        {runScorer.isPending && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280 }}>
            <LoadingSpinner label="COMPUTING Z-SCORES…" size="lg" />
          </div>
        )}

        {defaultScores.isLoading && !result && !runScorer.isPending && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <SkeletonChart height={280} />
            <SkeletonBlock className="h-72" />
          </div>
        )}

        {!runScorer.isPending && displayData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Radar + Top list */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {/* Radar */}
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "var(--r)", padding: "18px 16px 8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>
                    Factor Profile
                  </p>
                  {activeTicker && (
                    <span style={{
                      fontFamily: "JetBrains Mono, monospace", fontSize: "0.82rem",
                      fontWeight: 700, color: "var(--orange)",
                    }}>
                      {activeTicker}
                    </span>
                  )}
                </div>
                {radarData.length ? (
                  <PlotlyChart data={radarData} layout={radarLayout} height={260} />
                ) : (
                  <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: "0.8rem" }}>
                    No data
                  </div>
                )}
              </div>

              {/* Top-8 list */}
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "var(--r)", padding: "18px 20px",
              }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 14 }}>
                  Top Ranked
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {assets.slice(0, 8).map((asset, i) => {
                    const t = String(getSafeValue(asset, "ticker") ?? "");
                    const score = Number(getSafeValue(asset, "TOTAL_SCORE") ?? 0);
                    const roe = Number(getSafeValue(asset, "returnOnEquity") ?? 0);
                    const isActive = t === activeTicker;
                    return (
                      <button
                        key={t}
                        onClick={() => setSelectedTicker(t)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                          background: isActive ? "var(--orange-dim)" : "var(--bg-base)",
                          border: `1px solid ${isActive ? "var(--orange-border)" : "var(--border)"}`,
                          borderRadius: "var(--r-sm)", cursor: "pointer", textAlign: "left",
                          transition: "all 0.12s",
                        }}
                      >
                        <span style={{ color: "var(--t3)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.6rem", minWidth: 16 }}>
                          #{i + 1}
                        </span>
                        <span style={{
                          flex: 1, fontFamily: "JetBrains Mono, monospace", fontSize: "0.82rem",
                          fontWeight: 600, color: isActive ? "var(--orange)" : "var(--t1)",
                        }}>
                          {t}
                        </span>
                        <span style={{ fontSize: "0.65rem", color: "var(--t3)", marginRight: 4 }}>
                          ROE {formatPercent(roe)}
                        </span>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", color: isActive ? "var(--orange)" : "var(--t2)", fontWeight: 600 }}>
                          {score.toFixed(3)}
                        </span>
                        {isActive && <ChevronRight size={10} style={{ color: "var(--orange)", flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Full table */}
            <div style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--r)", overflow: "hidden",
            }}>
              <div style={{
                padding: "14px 20px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <p style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>
                  {displayData.count ?? assets.length} Assets Scored
                  {activePreset !== "custom" && currentPreset && (
                    <span style={{ marginLeft: 8, color: "var(--orange)", textTransform: "none", letterSpacing: 0 }}>
                      · {currentPreset.label} strategy
                    </span>
                  )}
                </p>
                <span style={{ fontSize: "0.65rem", color: "var(--t3)" }}>Click row to inspect factor profile</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="terminal-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36, paddingLeft: 20 }}>#</th>
                      {RESULT_COLS.map((c) => <th key={c.key}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.slice(0, 50).map((asset, i) => {
                      const t = String(getSafeValue(asset, "ticker") ?? "");
                      const isActive = t === activeTicker;
                      return (
                        <tr
                          key={i}
                          onClick={() => setSelectedTicker(t)}
                          style={{
                            cursor: "pointer",
                            background: isActive ? "rgba(122,167,232,0.04)" : undefined,
                          }}
                        >
                          <td style={{ color: "var(--t3)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.68rem", paddingLeft: 20 }}>
                            {i + 1}
                          </td>
                          {RESULT_COLS.map((col) => {
                            const val = getSafeValue(asset, col.key);
                            return (
                              <td
                                key={col.key}
                                style={col.key === "ticker"
                                  ? { color: "var(--orange)", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }
                                  : {}}
                              >
                                {col.fmt && val !== undefined && val !== null
                                  ? (col.fmt as (v: number) => string)(val as number)
                                  : String(val ?? "N/A")}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!runScorer.isPending && !displayData && !defaultScores.isLoading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 240, gap: 12, color: "var(--t3)", fontSize: "0.8rem", textAlign: "center",
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)",
          }}>
            <Play size={20} style={{ opacity: 0.4 }} />
            <span>Select a strategy above and click RUN SCORER.</span>
            <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>Requires Screener results. Run Screener first if empty.</span>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
