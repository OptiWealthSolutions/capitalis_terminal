"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import type { ScreenerResult, Preset } from "@/lib/types";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatPercent, formatNumber, formatLargeNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Play, Save, Trash2, Plus, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Metric catalogue
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

const OPS = [">=", "<=", ">", "<"];

interface CriterionRow { id: string; metric: string; op: string; val: string }

const RESULT_COLS = [
  { key: "Ticker",         label: "TICKER" },
  { key: "Sector",         label: "SECTOR" },
  { key: "currentPrice",   label: "PRICE",      fmt: (v: number) => formatNumber(v, 2) },
  { key: "marketCap",      label: "MKT CAP",    fmt: formatLargeNumber },
  { key: "forwardPE",      label: "FWD P/E",    fmt: (v: number) => formatNumber(v, 2) },
  { key: "returnOnEquity", label: "ROE",        fmt: formatPercent },
  { key: "earningsGrowth", label: "EPS GR.",    fmt: formatPercent },
  { key: "dividendYield",  label: "DIV. YIELD", fmt: formatPercent },
];

// ---------------------------------------------------------------------------
// Quick-filter presets (built-in suggestions)
// ---------------------------------------------------------------------------
interface QuickPreset {
  id: string;
  label: string;
  description: string;
  criteria: { metric: string; op: string; val: string }[];
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "quality_growth",
    label: "Quality Growth",
    description: "High ROE + positive earnings growth",
    criteria: [
      { metric: "returnOnEquity", op: ">=", val: "0.15" },
      { metric: "earningsGrowth", op: ">=", val: "0.10" },
    ],
  },
  {
    id: "deep_value",
    label: "Deep Value",
    description: "Low P/E, low P/B, dividend income",
    criteria: [
      { metric: "trailingPE",  op: "<=", val: "15" },
      { metric: "priceToBook", op: "<=", val: "1.5" },
      { metric: "dividendYield", op: ">=", val: "0.02" },
    ],
  },
  {
    id: "growth_momentum",
    label: "Growth",
    description: "Strong earnings and revenue momentum",
    criteria: [
      { metric: "earningsGrowth", op: ">=", val: "0.20" },
      { metric: "revenueGrowth",  op: ">=", val: "0.15" },
    ],
  },
  {
    id: "income",
    label: "Income",
    description: "High dividend yield, stable balance sheet",
    criteria: [
      { metric: "dividendYield", op: ">=", val: "0.03" },
      { metric: "currentRatio",  op: ">=", val: "1.5" },
      { metric: "debtToEquity",  op: "<=", val: "1.0" },
    ],
  },
  {
    id: "wide_moat",
    label: "Wide Moat",
    description: "High margins + strong profitability",
    criteria: [
      { metric: "grossMargins",     op: ">=", val: "0.40" },
      { metric: "operatingMargins", op: ">=", val: "0.20" },
      { metric: "returnOnEquity",   op: ">=", val: "0.20" },
    ],
  },
  {
    id: "low_leverage",
    label: "Low Leverage",
    description: "Financially conservative companies",
    criteria: [
      { metric: "debtToEquity", op: "<=", val: "0.5" },
      { metric: "currentRatio", op: ">=", val: "2.0" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ScreenerPage() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === "dark";
  const qc = useQueryClient();

  const [criteria, setCriteria] = useState<CriterionRow[]>([
    { id: crypto.randomUUID(), metric: "returnOnEquity", op: ">=", val: "0.15" },
    { id: crypto.randomUUID(), metric: "forwardPE",      op: "<=", val: "30" },
  ]);
  const [result, setResult]           = useState<ScreenerResult | null>(null);
  const [presetName, setPresetName]   = useState("");
  const [sortKey, setSortKey]         = useState<string | null>(null);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");
  const [showBuilder, setShowBuilder] = useState(true);
  const [activeQuick, setActiveQuick] = useState<string | null>(null);

  // ---- saved presets from API ----
  const savedPresets = useQuery<Record<string, Preset>>({
    queryKey: ["screener-presets"],
    queryFn: () => get("/screener/presets"),
    staleTime: 300_000,
  });

  // ---- mutations ----
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
    onSuccess: (data) => {
      setResult(data);
      toast.success(`${data.count} assets passed the screen.`);
    },
    onError: () => toast.error("Screener failed."),
  });

  const savePreset = useMutation({
    mutationFn: () => post("/screener/presets", { name: presetName, criteria: buildCriteriaObj() }),
    onSuccess: () => {
      toast.success(`Preset "${presetName}" saved.`);
      setPresetName("");
      qc.invalidateQueries({ queryKey: ["screener-presets"] });
    },
    onError: () => toast.error("Failed to save preset."),
  });

  const deletePreset = useMutation({
    mutationFn: (name: string) => del(`/screener/presets/${encodeURIComponent(name)}`),
    onSuccess: () => {
      toast.success("Preset deleted.");
      qc.invalidateQueries({ queryKey: ["screener-presets"] });
    },
  });

  // ---- helpers ----
  const applyApiPreset = (preset: Preset) => {
    setCriteria(
      Object.entries(preset.criteria).map(([metric, c]) => ({
        id: crypto.randomUUID(), metric, op: c.op, val: String(c.val),
      }))
    );
    setActiveQuick(null);
    setShowBuilder(true);
  };

  const applyQuickPreset = (qp: QuickPreset) => {
    setCriteria(qp.criteria.map((c) => ({ ...c, id: crypto.randomUUID() })));
    setActiveQuick(qp.id);
    setShowBuilder(true);
  };

  const addCriterion = () =>
    setCriteria((prev) => [...prev, { id: crypto.randomUUID(), metric: "forwardPE", op: "<=", val: "25" }]);

  const removeCriterion = (id: string) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
    setActiveQuick(null);
  };

  const updateCriterion = (id: string, field: keyof CriterionRow, value: string) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    setActiveQuick(null);
  };

  const sortedAssets = result?.assets
    ? [...result.assets].sort((a, b) => {
        if (!sortKey) return 0;
        const av = parseFloat(String(a[sortKey] ?? 0)) || 0;
        const bv = parseFloat(String(b[sortKey] ?? 0)) || 0;
        return sortDir === "asc" ? av - bv : bv - av;
      })
    : [];

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const metricLabel = (key: string) => AVAILABLE_METRICS.find((m) => m.key === key)?.label ?? key;

  // ---- render ----
  return (
    <ErrorBoundary>
      <div className="fade-in p-4 sm:p-6" style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div className="flex items-end justify-between pb-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>
              {t.screener.breadcrumb}
            </p>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--t1)" }}>
              {t.screener.pageTitle}
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>
              {t.screener.subtitle}
            </p>
          </div>
          <button
            onClick={() => runScreen.mutate()}
            disabled={runScreen.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded text-xs font-semibold tracking-wider transition-all disabled:opacity-50"
            style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
          >
            {runScreen.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
            {runScreen.isPending ? "Screening…" : "Run Screen"}
          </button>
        </div>

        {/* ── Quick presets grid ── */}
        <div className="mt-5">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--t3)" }}>
            Quick Filters
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {QUICK_PRESETS.map((qp) => {
              const active = activeQuick === qp.id;
              return (
                <button
                  key={qp.id}
                  onClick={() => applyQuickPreset(qp)}
                  className="text-left px-3 py-3 rounded border transition-all"
                  style={{
                    background: active ? "var(--orange-dim)" : "var(--bg-card)",
                    borderColor: active ? "var(--orange-border)" : "var(--border)",
                  }}
                >
                  <p
                    className="text-xs font-semibold"
                    style={{ color: active ? "var(--orange)" : "var(--t1)" }}
                  >
                    {qp.label}
                  </p>
                  <p
                    className="text-xs mt-1 leading-snug"
                    style={{ color: active ? "var(--orange)" : "var(--t3)", opacity: active ? 0.85 : 1 }}
                  >
                    {qp.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Saved presets from API ── */}
        {!savedPresets.isLoading && !savedPresets.error && Object.keys(savedPresets.data ?? {}).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--t3)" }}>
              Saved Presets
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(savedPresets.data ?? {}).map(([name, preset]) => (
                <div
                  key={name}
                  className="flex items-center rounded border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                >
                  <button
                    onClick={() => applyApiPreset(preset)}
                    className="px-3 py-1.5 text-xs transition-colors"
                    style={{ color: "var(--t2)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t1)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t2)")}
                  >
                    {name}
                  </button>
                  {!name.startsWith("SYSTEM_") && (
                    <button
                      onClick={() => deletePreset.mutate(name)}
                      className="px-2 py-1.5 flex items-center transition-colors"
                      style={{ borderLeft: "1px solid var(--border)", color: "var(--t3)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--red)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t3)")}
                    >
                      <Trash2 size={9} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {savedPresets.isLoading && <SkeletonBlock className="h-8 mt-4" />}
        {savedPresets.error && <QueryError error={savedPresets.error as Error} />}

        {/* ── Criteria builder (collapsible) ── */}
        <div className="mt-5 rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <button
            type="button"
            onClick={() => setShowBuilder((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5"
          >
            <span className="text-xs font-semibold tracking-widest uppercase flex items-center gap-2" style={{ color: "var(--t2)" }}>
              <SlidersHorizontal size={13} style={{ color: "var(--orange)" }} />
              Criteria Builder
              <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-semibold"
                style={{ background: "var(--orange-dim)", color: "var(--orange)", fontSize: 10 }}>
                {criteria.length}
              </span>
            </span>
            {showBuilder
              ? <ChevronUp size={13} style={{ color: "var(--t3)" }} />
              : <ChevronDown size={13} style={{ color: "var(--t3)" }} />
            }
          </button>

          {showBuilder && (
            <div className="border-t" style={{ borderColor: "var(--border)" }}>
              {/* Criteria by group */}
              <div className="p-5 space-y-4">
                {/* Active criteria rows */}
                <div className="space-y-2">
                  {criteria.map((c) => {
                    const metric = AVAILABLE_METRICS.find((m) => m.key === c.metric);
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 px-4 py-3 rounded border"
                        style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}
                      >
                        {/* Group badge */}
                        <span
                          className="text-xs px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            color: "var(--t3)",
                            fontSize: 10,
                            minWidth: 64,
                            textAlign: "center",
                          }}
                        >
                          {metric?.group ?? "—"}
                        </span>

                        {/* Metric select */}
                        <select
                          value={c.metric}
                          onChange={(e) => updateCriterion(c.id, "metric", e.target.value)}
                          className="flex-1 text-xs bg-transparent outline-none cursor-pointer font-medium"
                          style={{ color: "var(--t1)", border: "none" }}
                        >
                          {GROUPS.map((g) => (
                            <optgroup key={g} label={g} style={{ background: "var(--bg-card)" }}>
                              {AVAILABLE_METRICS.filter((m) => m.group === g).map((m) => (
                                <option key={m.key} value={m.key} style={{ background: "var(--bg-card)" }}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        {/* Op */}
                        <select
                          value={c.op}
                          onChange={(e) => updateCriterion(c.id, "op", e.target.value)}
                          className="text-xs px-2 py-1 rounded border outline-none cursor-pointer font-mono"
                          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--t1)" }}
                        >
                          {OPS.map((op) => (
                            <option key={op} value={op} style={{ background: "var(--bg-card)" }}>{op}</option>
                          ))}
                        </select>

                        {/* Value */}
                        <input
                          type="number" value={c.val} step={0.01}
                          onChange={(e) => updateCriterion(c.id, "val", e.target.value)}
                          className="text-xs px-2 py-1 rounded border outline-none w-20 font-mono"
                          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--t1)" }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
                          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                        />

                        {/* Remove */}
                        <button
                          onClick={() => removeCriterion(c.id)}
                          className="shrink-0 transition-colors"
                          style={{ color: "var(--t3)" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--red)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t3)")}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add criterion + save preset row */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={addCriterion}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-all"
                    style={{ borderStyle: "dashed", borderColor: "var(--border)", color: "var(--t3)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--orange-border)";
                      (e.currentTarget as HTMLElement).style.color = "var(--t2)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLElement).style.color = "var(--t3)";
                    }}
                  >
                    <Plus size={11} />
                    Add criterion
                  </button>

                  {/* Save preset inline */}
                  <div className="flex items-center gap-2">
                    <input
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && presetName && savePreset.mutate()}
                      placeholder="Preset name…"
                      className="text-xs px-3 py-1.5 rounded border outline-none transition-colors placeholder:opacity-40"
                      style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)", width: 160 }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                    />
                    <button
                      onClick={() => presetName && savePreset.mutate()}
                      disabled={!presetName || savePreset.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition-all disabled:opacity-40"
                      style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t2)" }}
                    >
                      <Save size={11} />
                      Save preset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Results ── */}
        <div className="mt-5">
          {runScreen.isPending && (
            <div className="flex items-center justify-center h-52">
              <LoadingSpinner label="Scanning universe…" size="lg" />
            </div>
          )}

          {result && !runScreen.isPending && (
            <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {/* Result header — filter chips */}
              <div
                className="px-5 py-3 border-b flex flex-wrap items-center gap-2"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
              >
                <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t3)" }}>
                  {result.count} assets passed
                </span>
                <span style={{ color: "var(--border)" }}>·</span>
                {criteria.filter((c) => c.val).map((c) => (
                  <span
                    key={c.id}
                    className="px-2 py-0.5 rounded border text-xs font-mono"
                    style={{
                      background: "var(--orange-dim)",
                      borderColor: "var(--orange-border)",
                      color: "var(--orange)",
                    }}
                  >
                    {metricLabel(c.metric)} {c.op} {c.val}
                  </span>
                ))}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="w-full text-xs" style={{ background: "var(--bg-card)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {RESULT_COLS.map((col) => {
                        const sortable = col.key !== "Ticker" && col.key !== "Sector";
                        return (
                          <th
                            key={col.key}
                            onClick={() => sortable && handleSort(col.key)}
                            className={cn(sortable ? "cursor-pointer select-none" : "")}
                            style={{ padding: "10px 20px", textAlign: "left", color: "var(--t3)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              {sortKey === col.key && (
                                sortDir === "desc" ? <ChevronDown size={9} /> : <ChevronUp size={9} />
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAssets.map((asset, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-hover)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        {RESULT_COLS.map((col) => (
                          <td
                            key={col.key}
                            style={{
                              padding: "10px 20px",
                              fontFamily: col.key !== "Sector" ? "JetBrains Mono, monospace" : undefined,
                              color: col.key === "Ticker" ? "var(--orange)"
                                : col.key === "Sector" ? "var(--t2)"
                                : "var(--t1)",
                              fontWeight: col.key === "Ticker" ? 600 : 400,
                            }}
                          >
                            {col.fmt
                              ? col.fmt(asset[col.key] as number)
                              : String(asset[col.key] ?? "N/A")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!result && !runScreen.isPending && (
            <div
              className="flex flex-col items-center justify-center h-48 rounded border text-center space-y-3"
              style={{ borderColor: "var(--border)", borderStyle: "dashed", background: "var(--bg-card)" }}
            >
              <Play size={20} style={{ color: "var(--t3)" }} />
              <p className="text-xs" style={{ color: "var(--t3)" }}>
                Select a quick filter or build custom criteria, then run the screen.
              </p>
            </div>
          )}
        </div>

      </div>
    </ErrorBoundary>
  );
}
