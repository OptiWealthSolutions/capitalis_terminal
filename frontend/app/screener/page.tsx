"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import type { ScreenerResult, Preset } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatPercent, formatNumber, formatLargeNumber } from "@/lib/utils";
import {
  Play, Save, Trash2, Plus, ChevronDown, ChevronUp,
  SlidersHorizontal, Download, Sparkles, X,
} from "lucide-react";
import MetricTooltip from "@/components/ui/MetricTooltip";
import TickerLogo from "@/components/ui/TickerLogo";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n";
import { useInvestorMode } from "@/lib/investorMode";

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
const AVAILABLE_METRICS = [
  { key: "forwardPE",        label: "Forward P/E",       group: "Valuation" },
  { key: "trailingPE",       label: "Trailing P/E",      group: "Valuation" },
  { key: "priceToBook",      label: "Price / Book",      group: "Valuation" },
  { key: "dividendYield",    label: "Dividend Yield",    group: "Income" },
  { key: "returnOnEquity",   label: "Return on Equity",  group: "Quality" },
  { key: "currentRatio",     label: "Current Ratio",     group: "Quality" },
  { key: "debtToEquity",     label: "Debt / Equity",     group: "Quality" },
  { key: "earningsGrowth",   label: "Earnings Growth",   group: "Growth" },
  { key: "revenueGrowth",    label: "Revenue Growth",    group: "Growth" },
  { key: "grossMargins",     label: "Gross Margins",     group: "Margins" },
  { key: "operatingMargins", label: "Operating Margins", group: "Margins" },
];

const GROUPS = ["Valuation", "Quality", "Growth", "Income", "Margins"];
const OPS    = [">=", "<=", ">", "<"];

interface CriterionRow { id: string; metric: string; op: string; val: string }

const RESULT_COLS: { key: string; label: string; fmt?: (v: number) => string; tip?: string }[] = [
  { key: "Ticker",         label: "Ticker" },
  { key: "Sector",         label: "Sector" },
  { key: "currentPrice",   label: "Price",     fmt: (v) => formatNumber(v, 2) },
  { key: "marketCap",      label: "Mkt Cap",   fmt: formatLargeNumber },
  { key: "forwardPE",      label: "Fwd P/E",   fmt: (v) => formatNumber(v, 2), tip: "P/E using next-year earnings estimate." },
  { key: "returnOnEquity", label: "ROE",        fmt: formatPercent,              tip: "Return on Equity: profit as % of equity." },
  { key: "earningsGrowth", label: "EPS Gr.",    fmt: formatPercent,              tip: "Year-over-year diluted EPS growth." },
  { key: "dividendYield",  label: "Div. Yield", fmt: formatPercent,              tip: "Annual dividend as % of share price." },
];

function downloadCSV(filename: string, data: Record<string, unknown>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Quick-filter presets
// ---------------------------------------------------------------------------
interface QuickPreset { id: string; label: string; description: string; criteria: { metric: string; op: string; val: string }[] }

const QUICK_PRESETS: QuickPreset[] = [
  { id: "quality_growth",   label: "Quality Growth",  description: "High ROE + positive earnings growth",    criteria: [{ metric: "returnOnEquity", op: ">=", val: "0.15" }, { metric: "earningsGrowth", op: ">=", val: "0.10" }] },
  { id: "deep_value",       label: "Deep Value",      description: "Low P/E, low P/B, dividend income",       criteria: [{ metric: "trailingPE", op: "<=", val: "15" }, { metric: "priceToBook", op: "<=", val: "1.5" }, { metric: "dividendYield", op: ">=", val: "0.02" }] },
  { id: "growth_momentum",  label: "Growth",          description: "Strong earnings and revenue momentum",    criteria: [{ metric: "earningsGrowth", op: ">=", val: "0.20" }, { metric: "revenueGrowth", op: ">=", val: "0.15" }] },
  { id: "income",           label: "Income",          description: "High dividend yield, stable balance sheet", criteria: [{ metric: "dividendYield", op: ">=", val: "0.03" }, { metric: "currentRatio", op: ">=", val: "1.5" }, { metric: "debtToEquity", op: "<=", val: "1.0" }] },
  { id: "wide_moat",        label: "Wide Moat",       description: "High margins + strong profitability",     criteria: [{ metric: "grossMargins", op: ">=", val: "0.40" }, { metric: "operatingMargins", op: ">=", val: "0.20" }, { metric: "returnOnEquity", op: ">=", val: "0.20" }] },
  { id: "low_leverage",     label: "Low Leverage",    description: "Financially conservative companies",      criteria: [{ metric: "debtToEquity", op: "<=", val: "0.5" }, { metric: "currentRatio", op: ">=", val: "2.0" }] },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ScreenerPage() {
  const { t } = useI18n();
  const { mode, recommendations, openProfileModal } = useInvestorMode();
  const isSimple = mode === "simple";
  const qc = useQueryClient();

  const [criteria, setCriteria] = useState<CriterionRow[]>([
    { id: crypto.randomUUID(), metric: "returnOnEquity", op: ">=", val: "0.15" },
    { id: crypto.randomUUID(), metric: "forwardPE",      op: "<=", val: "30" },
  ]);
  const [result,       setResult]       = useState<ScreenerResult | null>(null);
  const [presetName,   setPresetName]   = useState("");
  const [sortKey,      setSortKey]      = useState<string | null>(null);
  const [sortDir,      setSortDir]      = useState<"asc" | "desc">("desc");
  const [activeQuick,  setActiveQuick]  = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>("All");

  const savedPresets = useQuery<Record<string, Preset>>({
    queryKey: ["screener-presets"],
    queryFn: () => get("/screener/presets"),
    staleTime: 300_000,
  });

  const buildCriteriaObj = () => {
    const obj: Record<string, { op: string; val: number }> = {};
    for (const c of criteria) {
      const v = parseFloat(c.val);
      if (!isNaN(v)) obj[c.metric] = { op: c.op, val: v };
    }
    return obj;
  };

  const runScreen = useMutation({
    mutationFn: () => post<ScreenerResult>("/screener/run", { criteria: buildCriteriaObj() }),
    onSuccess: (data) => { setResult(data); toast.success(`${data.count} assets passed.`); },
    onError: () => toast.error("Screener failed."),
  });

  const savePreset = useMutation({
    mutationFn: () => post("/screener/presets", { name: presetName, criteria: buildCriteriaObj() }),
    onSuccess: () => { toast.success(`"${presetName}" saved.`); setPresetName(""); qc.invalidateQueries({ queryKey: ["screener-presets"] }); },
    onError: () => toast.error("Failed to save preset."),
  });

  const deletePreset = useMutation({
    mutationFn: (name: string) => del(`/screener/presets/${encodeURIComponent(name)}`),
    onSuccess: () => { toast.success("Preset deleted."); qc.invalidateQueries({ queryKey: ["screener-presets"] }); },
  });

  const applyApiPreset = (preset: Preset) => {
    setCriteria(Object.entries(preset.criteria).map(([metric, c]) => ({ id: crypto.randomUUID(), metric, op: c.op, val: String(c.val) })));
    setActiveQuick(null);
  };

  const applyQuickPreset = (qp: QuickPreset) => {
    setCriteria(qp.criteria.map(c => ({ ...c, id: crypto.randomUUID() })));
    setActiveQuick(qp.id);
  };

  const addCriterion    = () => setCriteria(prev => [...prev, { id: crypto.randomUUID(), metric: "forwardPE", op: "<=", val: "25" }]);
  const removeCriterion = (id: string) => { setCriteria(prev => prev.filter(c => c.id !== id)); setActiveQuick(null); };
  const updateCriterion = (id: string, field: keyof CriterionRow, value: string) => { setCriteria(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c)); setActiveQuick(null); };
  const metricLabel     = (key: string) => AVAILABLE_METRICS.find(m => m.key === key)?.label ?? key;

  const availableSectors = useMemo(() => {
    if (!result?.assets) return [];
    const sectors = new Set(result.assets.map(a => String(a["Sector"] ?? "Unknown")));
    return ["All", ...Array.from(sectors).filter(s => s !== "Unknown" && s !== "All").sort()];
  }, [result]);

  const sortedAssets = result?.assets
    ? [...result.assets]
        .filter(a => sectorFilter === "All" || String(a["Sector"] ?? "") === sectorFilter)
        .sort((a, b) => {
          if (!sortKey) return 0;
          const av = parseFloat(String(a[sortKey] ?? 0)) || 0;
          const bv = parseFloat(String(b[sortKey] ?? 0)) || 0;
          return sortDir === "asc" ? av - bv : bv - av;
        })
    : [];

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <ErrorBoundary>
      <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.06em", color: "var(--t3)", marginBottom: 4 }}>{t.screener.breadcrumb}</p>
            <h1 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.6rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{t.screener.pageTitle}</h1>
            <p style={{ fontSize: "0.78rem", color: "var(--t3)", marginTop: 4 }}>{t.screener.subtitle}</p>
          </div>
          {!isSimple && (
            <button onClick={() => runScreen.mutate()} disabled={runScreen.isPending} className="btn-primary">
              {runScreen.isPending ? <LoadingSpinner size="sm" /> : <Play size={13} />}
              {runScreen.isPending ? "Screening…" : "Run Screen"}
            </button>
          )}
        </div>

        {/* ── SIMPLE MODE ────────────────────────────────────────────── */}
        {isSimple && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 2 }}>Choose a strategy</p>
                <p style={{ fontSize: "0.78rem", color: "var(--t3)" }}>Select a pre-built strategy to screen the market instantly.</p>
              </div>
              <button onClick={openProfileModal} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "7px 14px", fontSize: "0.75rem", color: "var(--t2)", cursor: "pointer" }}>
                <Sparkles size={11} /> Update profile
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {QUICK_PRESETS.map(qp => {
                const isRec    = recommendations?.screenerPreset === qp.id;
                const isActive = activeQuick === qp.id;
                return (
                  <button key={qp.id} onClick={() => { applyQuickPreset(qp); runScreen.mutate(); }}
                    style={{ textAlign: "left", padding: "18px 20px", borderRadius: "var(--r-xl)", border: `1px solid ${isActive ? "var(--orange)" : isRec ? "rgba(0,74,198,0.3)" : "var(--card-border)"}`, background: isActive ? "var(--orange-dim)" : "var(--bg-card)", cursor: "pointer", position: "relative" }}
                  >
                    {isRec && (
                      <span style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 3, background: "var(--orange)", color: "#fff", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.06em", borderRadius: "9999px", padding: "2px 8px" }}>
                        <Sparkles size={7} /> FOR YOU
                      </span>
                    )}
                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: isActive ? "var(--orange)" : "var(--t1)", marginBottom: 4 }}>{qp.label}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--t3)", lineHeight: 1.5, marginBottom: 10 }}>{qp.description}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {qp.criteria.map(c => (
                        <span key={`${c.metric}-${c.op}-${c.val}`} style={{ fontSize: "0.6rem", padding: "2px 7px", borderRadius: "9999px", background: "var(--bg-inner)", color: "var(--t3)" }}>
                          {c.metric} {c.op} {c.val}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ADVANCED MODE: 2-column layout ─────────────────────────── */}
        {!isSimple && (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

            {/* ─── LEFT FILTER PANEL ─────────────────────────────────── */}
            <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Quick presets */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "16px 18px" }}>
                <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 12 }}>Quick Filters</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {QUICK_PRESETS.map(qp => {
                    const active = activeQuick === qp.id;
                    return (
                      <button key={qp.id} onClick={() => applyQuickPreset(qp)}
                        style={{ textAlign: "left", padding: "8px 12px", borderRadius: "var(--r-md)", border: `1px solid ${active ? "var(--orange-border)" : "transparent"}`, background: active ? "var(--orange-dim)" : "transparent", cursor: "pointer" }}
                      >
                        <p style={{ fontSize: "0.8rem", fontWeight: 600, color: active ? "var(--orange)" : "var(--t1)", marginBottom: 1 }}>{qp.label}</p>
                        <p style={{ fontSize: "0.68rem", color: "var(--t3)", lineHeight: 1.4 }}>{qp.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Saved presets */}
              {!savedPresets.isLoading && Object.keys(savedPresets.data ?? {}).length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "16px 18px" }}>
                  <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10 }}>Saved Presets</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {Object.entries(savedPresets.data ?? {}).map(([name, preset]) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button onClick={() => applyApiPreset(preset)} style={{ flex: 1, textAlign: "left", padding: "6px 10px", borderRadius: "var(--r-sm)", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "var(--t2)" }}>
                          {name}
                        </button>
                        {!name.startsWith("SYSTEM_") && (
                          <button onClick={() => deletePreset.mutate(name)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--t3)" }}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Run button (repeat for convenience) */}
              <button onClick={() => runScreen.mutate()} disabled={runScreen.isPending} className="btn-primary w-full">
                {runScreen.isPending ? <LoadingSpinner size="sm" /> : <Play size={13} />}
                {runScreen.isPending ? "Screening…" : "Run Screen"}
              </button>
            </div>

            {/* ─── RIGHT: criteria builder + results ─────────────────── */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Criteria builder */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SlidersHorizontal size={14} style={{ color: "var(--orange)" }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--t1)", fontFamily: "Manrope, DM Sans, sans-serif" }}>Criteria Builder</span>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 7px", borderRadius: "9999px", background: "var(--orange-dim)", color: "var(--orange)" }}>{criteria.length}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Save preset */}
                    <input value={presetName} onChange={e => setPresetName(e.target.value)} onKeyDown={e => e.key === "Enter" && presetName && savePreset.mutate()}
                      placeholder="Preset name…"
                      style={{ fontSize: "0.75rem", padding: "5px 10px", background: "var(--bg-inner)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", color: "var(--t1)", outline: "none", width: 140 }}
                      onFocus={e => e.currentTarget.style.borderColor = "var(--orange)"}
                      onBlur={e => e.currentTarget.style.borderColor = "var(--card-border)"}
                    />
                    <button onClick={() => presetName && savePreset.mutate()} disabled={!presetName || savePreset.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "5px 12px", fontSize: "0.72rem", color: "var(--t2)", cursor: "pointer", opacity: !presetName ? 0.4 : 1 }}>
                      <Save size={11} /> Save
                    </button>
                  </div>
                </div>

                {/* Criteria rows */}
                <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {criteria.map(c => {
                    const metric = AVAILABLE_METRICS.find(m => m.key === c.metric);
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-inner)", borderRadius: "var(--r-md)" }}>
                        {/* Group tag */}
                        <span style={{ fontSize: "0.58rem", fontWeight: 600, padding: "2px 8px", borderRadius: "9999px", background: "var(--bg-card)", border: "1px solid var(--card-border)", color: "var(--t3)", whiteSpace: "nowrap", minWidth: 60, textAlign: "center" }}>
                          {metric?.group ?? "—"}
                        </span>
                        {/* Metric */}
                        <select value={c.metric} onChange={e => updateCriterion(c.id, "metric", e.target.value)}
                          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer" }}>
                          {GROUPS.map(g => (
                            <optgroup key={g} label={g} style={{ background: "var(--bg-card)" }}>
                              {AVAILABLE_METRICS.filter(m => m.group === g).map(m => (
                                <option key={m.key} value={m.key} style={{ background: "var(--bg-card)" }}>{m.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {/* Op */}
                        <select value={c.op} onChange={e => updateCriterion(c.id, "op", e.target.value)}
                          style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "4px 8px", fontSize: "0.75rem", color: "var(--t1)", outline: "none", cursor: "pointer" }}>
                          {OPS.map(op => <option key={op} value={op} style={{ background: "var(--bg-card)" }}>{op}</option>)}
                        </select>
                        {/* Value */}
                        <input type="number" value={c.val} step={0.01} onChange={e => updateCriterion(c.id, "val", e.target.value)}
                          style={{ width: 80, background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "4px 8px", fontSize: "0.75rem", color: "var(--t1)", outline: "none", textAlign: "right" }}
                          onFocus={e => e.currentTarget.style.borderColor = "var(--orange)"}
                          onBlur={e => e.currentTarget.style.borderColor = "var(--card-border)"}
                        />
                        {/* Remove */}
                        <button onClick={() => removeCriterion(c.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--t3)", display: "flex", alignItems: "center" }}>
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}

                  <button onClick={addCriterion}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--r-md)", border: "1.5px dashed var(--card-border)", background: "transparent", color: "var(--t3)", fontSize: "0.75rem", cursor: "pointer", width: "fit-content" }}>
                    <Plus size={12} /> Add criterion
                  </button>
                </div>
              </div>

              {/* ── Results ───────────────────────────────────────────── */}
              {runScreen.isPending && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)" }}>
                  <LoadingSpinner label="Scanning universe…" size="lg" />
                </div>
              )}

              {result && !runScreen.isPending && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                  {/* Result header */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--t2)" }}>{result.count} assets passed</span>
                    <div style={{ width: 1, height: 12, background: "var(--card-border)" }} />
                    {/* Active criteria chips */}
                    {criteria.filter(c => c.val).map(c => (
                      <span key={c.id} style={{ fontSize: "0.62rem", fontWeight: 600, padding: "2px 9px", borderRadius: "9999px", background: "var(--orange-dim)", color: "var(--orange)", border: "1px solid var(--orange-border)" }}>
                        {metricLabel(c.metric)} {c.op} {c.val}
                      </span>
                    ))}
                    <button onClick={() => downloadCSV("screener_results.csv", sortedAssets)}
                      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", padding: "4px 10px", fontSize: "0.7rem", color: "var(--t3)", cursor: "pointer" }}>
                      <Download size={11} /> CSV
                    </button>
                  </div>

                  {/* Sector filter pills */}
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

                  {/* Table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                          {RESULT_COLS.map(col => {
                            const sortable = col.key !== "Ticker" && col.key !== "Sector";
                            return (
                              <th key={col.key} onClick={() => sortable && handleSort(col.key)}
                                style={{ padding: "10px 20px", textAlign: "left", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", cursor: sortable ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  {col.tip ? <MetricTooltip label={col.label} tip={col.tip} /> : col.label}
                                  {sortKey === col.key && (sortDir === "desc" ? <ChevronDown size={9} /> : <ChevronUp size={9} />)}
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAssets.map((asset, rowIdx) => (
                          <tr key={String(asset["Ticker"] ?? rowIdx)}
                            style={{ borderBottom: "1px solid var(--card-border)", background: rowIdx % 2 === 0 ? "var(--bg-card)" : "var(--bg-inner)" }}
                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-hover)"}
                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = rowIdx % 2 === 0 ? "var(--bg-card)" : "var(--bg-inner)"}
                          >
                            {RESULT_COLS.map(col => (
                              <td key={col.key} style={{ padding: "11px 20px", color: col.key === "Ticker" ? "var(--orange)" : col.key === "Sector" ? "var(--t2)" : "var(--t1)", fontWeight: col.key === "Ticker" ? 700 : 400, whiteSpace: "nowrap" }}>
                                {col.key === "Ticker" ? (
                                  <Link href={`/equity?ticker=${encodeURIComponent(String(asset[col.key] ?? ""))}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
                                    <TickerLogo ticker={String(asset[col.key] ?? "")} size={26} />
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ display: "block", color: "var(--orange)", fontWeight: 700, fontSize: "0.84rem", fontFamily: "DM Sans, sans-serif" }}>{String(asset[col.key] ?? "N/A")}</span>
                                      {(() => {
                                        const desc = asset["Description"] != null ? String(asset["Description"]) : "";
                                        const name = asset["Name"] != null ? String(asset["Name"]) : "";
                                        const ticker = String(asset["Ticker"] ?? "");
                                        const display = (desc.length > 0 && desc !== ticker) ? desc : (name.length > 0 && name !== ticker) ? name : "";
                                        return display ? <span style={{ display: "block", color: "var(--t3)", fontSize: "0.65rem", marginTop: 1, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span> : null;
                                      })()}
                                    </span>
                                  </Link>
                                ) : col.fmt ? col.fmt(asset[col.key] as number) : String(asset[col.key] ?? "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Zero results */}
              {result && result.count === 0 && !runScreen.isPending && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12, background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", textAlign: "center" }}>
                  <Play size={20} style={{ color: "var(--t3)" }} />
                  <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--t1)" }}>No stocks matched</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--t3)", maxWidth: 380 }}>Relax the most restrictive filter or switch to a Quick Filter preset.</p>
                  <button onClick={() => { setCriteria([{ id: crypto.randomUUID(), metric: "returnOnEquity", op: ">=", val: "0.10" }]); setResult(null); }}
                    style={{ fontSize: "0.72rem", padding: "6px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--orange-border)", color: "var(--orange)", background: "var(--orange-dim)", cursor: "pointer" }}>
                    Reset filters
                  </button>
                </div>
              )}

              {/* Empty — not yet run */}
              {!result && !runScreen.isPending && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 10, background: "var(--bg-card)", border: "1.5px dashed var(--card-border)", borderRadius: "var(--r-xl)", textAlign: "center" }}>
                  <SlidersHorizontal size={22} style={{ color: "var(--t3)" }} />
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--t1)" }}>Configure your screen</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--t3)" }}>Select a quick filter or build custom criteria, then run the screen.</p>
                  <button onClick={() => runScreen.mutate()} disabled={runScreen.isPending} className="btn-primary" style={{ marginTop: 4 }}>
                    <Play size={12} /> Run Screen
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile run button */}
        {!isSimple && (
          <button onClick={() => runScreen.mutate()} disabled={runScreen.isPending}
            className="btn-primary fixed sm:hidden flex items-center gap-2 z-40"
            style={{ right: 16, bottom: 80, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {runScreen.isPending ? <LoadingSpinner size="sm" /> : <Play size={13} />}
            {runScreen.isPending ? "Screening" : "Run"}
          </button>
        )}
      </div>
    </ErrorBoundary>
  );
}
