"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import type { ScorerResult } from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonBlock, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatNumber, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Play, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

interface WeightEntry { key: string; label: string; defaultVal: number }

const WEIGHT_DEFS: WeightEntry[] = [
  { key: "F_Score", label: "F-Score (Piotroski)", defaultVal: 0.25 },
  { key: "returnOnEquity", label: "Return on Equity", defaultVal: 0.10 },
  { key: "pct_undervaluation", label: "Graham Undervaluation", defaultVal: 0.05 },
  { key: "trailingPE", label: "Trailing P/E (inverse)", defaultVal: 0.20 },
  { key: "Sharpe", label: "Sharpe Ratio", defaultVal: 0.20 },
  { key: "Sortino", label: "Sortino Ratio", defaultVal: 0.00 },
  { key: "CAGR", label: "CAGR", defaultVal: 0.05 },
  { key: "earningsGrowth", label: "Earnings Growth", defaultVal: 0.10 },
  { key: "Vol_Ann", label: "Volatility (inverse)", defaultVal: 0.05 },
];

export default function ScorerPage() {
  const totalDefault = WEIGHT_DEFS.reduce((s, w) => s + w.defaultVal, 0);
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(WEIGHT_DEFS.map((w) => [w.key, w.defaultVal]))
  );
  const [result, setResult] = useState<ScorerResult | null>(null);

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
      toast.success(`Scoring complete. ${data.count} assets ranked.`);
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      const detail = err?.response?.data?.detail ?? err.message;
      toast.error(`Scorer failed: ${detail}`);
    },
  });

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const totalOk = Math.abs(total - 1.0) <= 0.01;

  const resetWeights = () =>
    setWeights(Object.fromEntries(WEIGHT_DEFS.map((w) => [w.key, w.defaultVal])));

  const displayData = result ?? defaultScores.data;

  // Extraction sécurisée insensible à la casse pour éviter de formatter des undefined
  const getSafeValue = (obj: any, key: string) => {
    if (!obj) return undefined;
    if (obj[key] !== undefined) return obj[key];
    const lowerKey = key.toLowerCase();
    for (const k in obj) {
      if (k.toLowerCase() === lowerKey) return obj[k];
    }
    return undefined;
  };

  // Top-20 bar chart
  const top20Assets = displayData?.assets?.slice(0, 20) ?? [];
  const scores = top20Assets.map((a) => (getSafeValue(a, "TOTAL_SCORE") ?? 0) as number).reverse();
  const tickers = top20Assets.map((a) => String(getSafeValue(a, "ticker") ?? "")).reverse();

  const barData = top20Assets.length
    ? [
        {
          type: "bar" as const,
          orientation: "h" as const,
          x: scores,
          y: tickers,
          marker: {
            color: scores.map((v) => (v > 0 ? "#3B82F6" : "#FF4136")),
          },
          hovertemplate: "%{y}: %{x:.4f}<extra></extra>",
        },
      ]
    : [];

  const RESULT_COLS = [
    { key: "ticker", label: "TICKER" },
    { key: "sector", label: "SECTOR" },
    { key: "TOTAL_SCORE", label: "SCORE", fmt: (v: number) => formatNumber(v, 4) },
    { key: "F_Score", label: "F-SCORE", fmt: (v: number) => formatNumber(v, 0) },
    { key: "returnOnEquity", label: "ROE", fmt: formatPercent },
    { key: "Sharpe", label: "SHARPE", fmt: (v: number) => formatNumber(v, 3) },
    { key: "CAGR", label: "CAGR", fmt: formatPercent },
    { key: "Vol_Ann", label: "VOL (ANN)", fmt: formatPercent },
  ];

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
          Multi-Factor Scorer
        </h1>

        <div className="grid grid-cols-4 gap-5">
          {/* Weights panel */}
          <div className="col-span-1 space-y-3">
            <div className="bg-bg-secondary border border-bg-border rounded-md p-4 space-y-3 shadow-card">
              <div className="flex items-center justify-between">
                <SectionLabel>FACTOR WEIGHTS</SectionLabel>
                <button
                  onClick={resetWeights}
                  className="text-text-muted hover:text-text-primary transition-colors"
                  title="Reset to defaults"
                >
                  <RotateCcw size={12} />
                </button>
              </div>

              {WEIGHT_DEFS.map((w) => (
                <div key={w.key} className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-xs text-text-secondary truncate">{w.label}</label>
                    <span className="text-xs text-text-primary font-medium">{(weights[w.key] * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={weights[w.key] * 100}
                    onChange={(e) =>
                      setWeights((prev) => ({ ...prev, [w.key]: parseFloat(e.target.value) / 100 }))
                    }
                    className="w-full accent-accent-blue h-1 cursor-pointer"
                  />
                </div>
              ))}

              <div className={cn("flex justify-between text-xs pt-2 border-t border-bg-border", totalOk ? "text-accent-green" : "text-accent-red")}>
                <span>TOTAL</span>
                <span>{(total * 100).toFixed(0)}% {totalOk ? "OK" : "(must = 100%)"}</span>
              </div>
            </div>

            <button
              onClick={() => runScorer.mutate()}
              disabled={runScorer.isPending || !totalOk}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:bg-orange-600 text-black text-xs font-semibold rounded-md disabled:opacity-50 transition-all hover:shadow-glow"
            >
              {runScorer.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
              {runScorer.isPending ? "SCORING..." : "RUN SCORER"}
            </button>

            {!totalOk && (
              <p className="text-accent-red text-xs text-center">
                Weights must sum to 100%.
              </p>
            )}
          </div>

          {/* Results */}
          <div className="col-span-3 space-y-4">
            {runScorer.isPending && (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner label="COMPUTING Z-SCORES..." size="lg" />
              </div>
            )}

            {defaultScores.isLoading && !result && (
              <div className="space-y-3">
                <SkeletonChart height={380} />
                <SkeletonBlock className="h-48" />
              </div>
            )}

            {!runScorer.isPending && displayData && (
              <>
                {/* Bar chart */}
                <div>
                  <SectionLabel>TOP 20 — COMPOSITE SCORE RANKING</SectionLabel>
                  <PlotlyChart
                    data={barData}
                    layout={{
                      xaxis: { title: { text: "Composite Z-Score", font: { size: 10 } } },
                      margin: { l: 120, r: 30, t: 20, b: 40 },
                    }}
                    height={420}
                  />
                </div>

                {/* Full table */}
                <div>
                  <SectionLabel>{displayData.count ?? displayData.assets?.length ?? 0} ASSETS SCORED</SectionLabel>
                  <div className="overflow-x-auto">
                    <table className="terminal-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          {RESULT_COLS.map((c) => <th key={c.key}>{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {displayData?.assets?.slice(0, 50).map((asset, i) => (
                          <tr key={i}>
                            <td className="text-text-muted">{i + 1}</td>
                            {RESULT_COLS.map((col) => {
                              const val = getSafeValue(asset, col.key);
                              return (
                                <td key={col.key} className={col.key === "ticker" ? "text-accent-blue font-medium" : ""}>
                                  {col.fmt && val !== undefined && val !== null
                                    ? col.fmt(val as number)
                                    : String(val ?? "N/A")}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!runScorer.isPending && !displayData && !defaultScores.isLoading && (
              <div className="flex items-center justify-center h-64 text-text-muted text-xs text-center">
                No scored data found.<br />
                Run the Screener first, then click RUN SCORER.
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
