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
import { Play, Save, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

const AVAILABLE_METRICS = [
  { key: "forwardPE", label: "Forward P/E", type: "ratio" },
  { key: "trailingPE", label: "Trailing P/E", type: "ratio" },
  { key: "priceToBook", label: "Price/Book", type: "ratio" },
  { key: "dividendYield", label: "Dividend Yield", type: "pct" },
  { key: "returnOnEquity", label: "Return on Equity", type: "pct" },
  { key: "currentRatio", label: "Current Ratio", type: "ratio" },
  { key: "earningsGrowth", label: "Earnings Growth", type: "pct" },
  { key: "revenueGrowth", label: "Revenue Growth", type: "pct" },
  { key: "grossMargins", label: "Gross Margins", type: "pct" },
  { key: "operatingMargins", label: "Operating Margins", type: "pct" },
  { key: "debtToEquity", label: "Debt/Equity", type: "ratio" },
];

const OPS = [">=", "<=", ">", "<"];

interface CriterionRow {
  id: string;
  metric: string;
  op: string;
  val: string;
}

export default function ScreenerPage() {
  const qc = useQueryClient();
  const [criteria, setCriteria] = useState<CriterionRow[]>([
    { id: crypto.randomUUID(), metric: "returnOnEquity", op: ">=", val: "0.15" },
    { id: crypto.randomUUID(), metric: "forwardPE", op: "<=", val: "30" },
  ]);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [presetName, setPresetName] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // --- Presets ---
  const presets = useQuery<Record<string, Preset>>({
    queryKey: ["screener-presets"],
    queryFn: () => get("/screener/presets"),
    staleTime: 300_000,
  });

  // --- Run screener ---
  const runScreen = useMutation({
    mutationFn: () => {
      const criteriaObj: Record<string, { op: string; val: number }> = {};
      for (const c of criteria) {
        const v = parseFloat(c.val);
        if (!isNaN(v)) criteriaObj[c.metric] = { op: c.op, val: v };
      }
      return post<ScreenerResult>("/screener/run", { criteria: criteriaObj });
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(`${data.count} assets passed the screen.`);
    },
    onError: () => toast.error("Screener failed."),
  });

  // --- Save preset ---
  const savePreset = useMutation({
    mutationFn: () => {
      const criteriaObj: Record<string, { op: string; val: number }> = {};
      for (const c of criteria) {
        const v = parseFloat(c.val);
        if (!isNaN(v)) criteriaObj[c.metric] = { op: c.op, val: v };
      }
      return post("/screener/presets", { name: presetName, criteria: criteriaObj });
    },
    onSuccess: () => {
      toast.success(`Preset "${presetName}" saved.`);
      setPresetName("");
      qc.invalidateQueries({ queryKey: ["screener-presets"] });
    },
    onError: () => toast.error("Failed to save preset."),
  });

  // --- Delete preset ---
  const deletePreset = useMutation({
    mutationFn: (name: string) => del(`/screener/presets/${encodeURIComponent(name)}`),
    onSuccess: () => {
      toast.success("Preset deleted.");
      qc.invalidateQueries({ queryKey: ["screener-presets"] });
    },
  });

  const applyPreset = (preset: Preset) => {
    const rows: CriterionRow[] = Object.entries(preset.criteria).map(([metric, c]) => ({
      id: crypto.randomUUID(),
      metric,
      op: c.op,
      val: String(c.val),
    }));
    setCriteria(rows);
  };

  const addCriterion = () =>
    setCriteria((prev) => [...prev, { id: crypto.randomUUID(), metric: "forwardPE", op: "<=", val: "25" }]);

  const removeCriterion = (id: string) =>
    setCriteria((prev) => prev.filter((c) => c.id !== id));

  const updateCriterion = (id: string, field: keyof CriterionRow, value: string) =>
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  // Sort table
  const sortedAssets = result?.assets
    ? [...result.assets].sort((a, b) => {
        if (!sortKey) return 0;
        const av = a[sortKey] as number ?? 0;
        const bv = b[sortKey] as number ?? 0;
        return sortDir === "asc" ? av - bv : bv - av;
      })
    : [];

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const RESULT_COLS = [
    { key: "Ticker", label: "TICKER" },
    { key: "Sector", label: "SECTOR" },
    { key: "currentPrice", label: "PRICE", fmt: (v: number) => formatNumber(v, 2) },
    { key: "marketCap", label: "MKT CAP", fmt: formatLargeNumber },
    { key: "forwardPE", label: "FWD P/E", fmt: (v: number) => formatNumber(v, 2) },
    { key: "returnOnEquity", label: "ROE", fmt: formatPercent },
    { key: "earningsGrowth", label: "EPS GR.", fmt: formatPercent },
    { key: "dividendYield", label: "DIV. YIELD", fmt: formatPercent },
  ];

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
          Equity Screener
        </h1>

        <div className="grid grid-cols-3 gap-5">
          {/* LEFT: Builder */}
          <div className="col-span-1 space-y-4">
            {/* Presets */}
            <div className="bg-bg-secondary border border-bg-border rounded-md p-3 shadow-card">
              <SectionLabel>PRESETS</SectionLabel>
              {presets.isLoading ? <SkeletonBlock className="h-16" /> :
               presets.error ? <QueryError error={presets.error as Error} /> :
               <div className="space-y-1">
                 {Object.entries(presets.data ?? {}).map(([name, preset]) => (
                   <div key={name} className="flex items-center justify-between">
                     <button
                       onClick={() => applyPreset(preset)}
                       className="text-xs text-accent-blue hover:text-blue-400 text-left flex-1 truncate"
                     >
                       {name}
                     </button>
                     {!name.startsWith("SYSTEM_") && (
                       <button
                         onClick={() => deletePreset.mutate(name)}
                         className="text-text-muted hover:text-accent-red transition-colors ml-2"
                       >
                         <Trash2 size={10} />
                       </button>
                     )}
                   </div>
                 ))}
               </div>
              }
            </div>

            {/* Criteria builder */}
            <div className="bg-bg-secondary border border-bg-border rounded-md p-3 space-y-2 shadow-card">
              <SectionLabel>SCREENING CRITERIA</SectionLabel>
              {criteria.map((c) => (
                <div key={c.id} className="flex items-center gap-1">
                  <select
                    value={c.metric}
                    onChange={(e) => updateCriterion(c.id, "metric", e.target.value)}
                    className="flex-1 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-1 py-1 focus:outline-none focus:border-accent-blue min-w-0"
                  >
                    {AVAILABLE_METRICS.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => updateCriterion(c.id, "op", e.target.value)}
                    className="w-12 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-1 py-1 focus:outline-none focus:border-accent-blue"
                  >
                    {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input
                    type="number"
                    value={c.val}
                    onChange={(e) => updateCriterion(c.id, "val", e.target.value)}
                    step={0.01}
                    className="w-16 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-1 py-1 focus:outline-none focus:border-accent-blue"
                  />
                  <button onClick={() => removeCriterion(c.id)} className="text-text-muted hover:text-accent-red transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button
                onClick={addCriterion}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                + Add criterion
              </button>
            </div>

            {/* Save preset */}
            <div className="bg-bg-secondary border border-bg-border rounded-md p-3 space-y-2 shadow-card">
              <SectionLabel>SAVE AS PRESET</SectionLabel>
              <div className="flex gap-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name..."
                  className="flex-1 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:border-accent-blue placeholder:text-text-muted"
                />
                <button
                  onClick={() => presetName && savePreset.mutate()}
                  disabled={!presetName || savePreset.isPending}
                  className="px-2 bg-bg-tertiary border border-bg-border hover:border-accent-blue text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
                >
                  <Save size={12} />
                </button>
              </div>
            </div>

            {/* Run */}
            <button
              onClick={() => runScreen.mutate()}
              disabled={runScreen.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:bg-orange-600 text-black text-xs font-semibold rounded-md disabled:opacity-50 transition-all hover:shadow-glow"
            >
              {runScreen.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
              {runScreen.isPending ? "SCREENING..." : "RUN SCREEN"}
            </button>
          </div>

          {/* RIGHT: Results */}
          <div className="col-span-2">
            {runScreen.isPending && (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner label="SCANNING UNIVERSE..." size="lg" />
              </div>
            )}

            {result && !runScreen.isPending && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>{result.count} ASSETS PASSED</SectionLabel>
                </div>
                <div className="overflow-x-auto">
                  <table className="terminal-table">
                    <thead>
                      <tr>
                        {RESULT_COLS.map((col) => (
                          <th
                            key={col.key}
                            onClick={() => col.key !== "Ticker" && col.key !== "Sector" && handleSort(col.key)}
                            className={cn(col.key !== "Ticker" && col.key !== "Sector" && "cursor-pointer hover:text-text-primary transition-colors")}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              {sortKey === col.key && (sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAssets.map((asset, i) => (
                        <tr key={i}>
                          {RESULT_COLS.map((col) => (
                            <td key={col.key} className={col.key === "Ticker" ? "text-accent-blue font-medium" : ""}>
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
              <div className="flex items-center justify-center h-64 text-text-muted text-xs">
                Configure criteria and run the screen.
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-text-secondary text-xs uppercase tracking-widest mb-2">{children}</div>;
}
