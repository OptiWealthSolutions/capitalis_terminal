"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { downloadPdf } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { triggerBlobDownload } from "@/lib/utils";
import {
  FileText, Download, CheckSquare, Square, AlertTriangle,
  TrendingUp, Activity, Target, TrendingDown, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n";
import type { OptimizationResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SavedPortfolio {
  id: string;
  name: string;
  tickers: string[];
  method: string;
  capital: number;
  result: OptimizationResult | null;
  savedAt: string;
}

const PF_STORAGE_KEY = "capitalis_portfolios_v2";

function loadPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PF_STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtNum(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}
function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ReportingPage() {
  const { t } = useI18n();
  const [portfolios, setPortfolios]   = useState<SavedPortfolio[]>([]);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [nSims, setNSims]             = useState(500);

  useEffect(() => {
    const pfs = loadPortfolios().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    setPortfolios(pfs);
    if (pfs.length > 0) setSelectedId(pfs[0].id);
  }, []);

  const selected = portfolios.find(p => p.id === selectedId) ?? null;
  const metrics  = selected?.result?.metrics ?? null;
  const weights  = selected?.result?.weights ?? {};

  const generatePdf = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No portfolio selected.");
      if (!selected.result) throw new Error("Portfolio has no optimization result.");

      const tickers = Object.keys(weights);
      const wValues = Object.values(weights);

      return downloadPdf("/reporting/generate-pdf", {
        portfolio_name: selected.name,
        method: selected.method,
        tickers,
        weights: wValues,
        capital: selected.capital,
        n_simulations: nSims,
        precomputed_metrics: metrics
          ? {
              expected_annual_return: metrics.expected_annual_return,
              annual_volatility:      metrics.annual_volatility,
              sharpe_ratio:           metrics.sharpe_ratio,
              sortino_ratio:          metrics.sortino_ratio,
              calmar_ratio:           metrics.calmar_ratio,
              max_drawdown:           metrics.max_drawdown,
              beta:                   metrics.beta,
            }
          : null,
      });
    },
    onSuccess: (blob) => {
      const safe = selected?.name.replace(/\s+/g, "_") ?? "portfolio";
      const filename = `capitalis_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
      triggerBlobDownload(blob, filename);
      toast.success("PDF report downloaded.");
    },
    onError: (e: Error) => toast.error(e.message || "PDF generation failed."),
  });

  const canGenerate = !!selected?.result && Object.keys(weights).length > 0;

  // ---------------------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto fade-in">

        {/* ── Header ── */}
        <div className="mb-6 flex items-end justify-between border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>
              {t.reporting.breadcrumb}
            </p>
            <h1 className="text-xl font-semibold" style={{ color: "var(--t1)" }}>
              {t.reporting.pageTitle}
            </h1>
          </div>
          <button
            onClick={() => generatePdf.mutate()}
            disabled={generatePdf.isPending || !canGenerate}
            className="flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm transition-all disabled:opacity-40"
            style={{ background: "var(--orange)", color: "var(--bg-base)" }}
          >
            {generatePdf.isPending
              ? <><LoadingSpinner size="sm" /> Generating…</>
              : <><Download size={14} /> Generate PDF</>
            }
          </button>
        </div>

        {portfolios.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded border text-center"
            style={{
              borderColor: "var(--border)", borderStyle: "dashed",
              background: "var(--bg-card)", minHeight: 320, gap: 12,
            }}
          >
            <FileText size={28} style={{ color: "var(--t3)" }} />
            <p style={{ color: "var(--t1)", fontWeight: 600 }}>No portfolios saved</p>
            <p style={{ color: "var(--t3)", fontSize: "0.82rem" }}>
              Run an optimization in the Allocation page and save a portfolio first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* ── Left: portfolio list ── */}
            <div className="col-span-1 lg:col-span-4 space-y-2">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--t3)" }}>
                Saved Portfolios
              </p>
              {portfolios.map(pf => {
                const active = pf.id === selectedId;
                const m = pf.result?.metrics;
                return (
                  <button
                    key={pf.id}
                    onClick={() => setSelectedId(pf.id)}
                    className="w-full text-left rounded border px-4 py-3 transition-all"
                    style={{
                      background: active ? "var(--orange-dim)" : "var(--bg-card)",
                      borderColor: active ? "var(--orange-border)" : "var(--border)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: active ? "var(--orange)" : "var(--t1)" }}>
                        {pf.name}
                      </span>
                      {active && <ChevronRight size={13} style={{ color: "var(--orange)" }} />}
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                      {pf.method} · {pf.tickers.length} assets · {fmtEur(pf.capital)}
                    </p>
                    {m && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs font-mono" style={{ color: "var(--green)" }}>
                          {fmtPct(m.expected_annual_return)}
                        </span>
                        <span className="text-xs font-mono" style={{ color: "var(--t2)" }}>
                          Sharpe {fmtNum(m.sharpe_ratio, 2)}
                        </span>
                      </div>
                    )}
                    {!pf.result && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <AlertTriangle size={11} style={{ color: "var(--yellow)" }} />
                        <span className="text-xs" style={{ color: "var(--yellow)" }}>No optimization result</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Right: preview + settings ── */}
            <div className="col-span-1 lg:col-span-8 space-y-4">

              {selected ? (
                <>
                  {/* Metrics strip */}
                  {metrics && (
                    <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                          Risk Metrics — {selected.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: "var(--border)" }}>
                        {[
                          { label: "Expected Return", value: fmtPct(metrics.expected_annual_return), icon: <TrendingUp size={12} />, color: metrics.expected_annual_return >= 0 ? "var(--green)" : "var(--red)" },
                          { label: "Volatility",      value: fmtPct(metrics.annual_volatility),      icon: <Activity size={12} />,   color: "var(--yellow)" },
                          { label: "Sharpe Ratio",    value: fmtNum(metrics.sharpe_ratio),            icon: <Target size={12} />,     color: "var(--orange)" },
                          { label: "Max Drawdown",    value: fmtPct(metrics.max_drawdown),            icon: <TrendingDown size={12} />, color: "var(--red)" },
                        ].map((m, i) => (
                          <div key={m.label} className="px-4 py-4" style={{ background: "var(--bg-card)" }}>
                            <div className="flex items-center gap-1.5 mb-1.5" style={{ color: "var(--t3)" }}>
                              <span style={{ color: "var(--orange)" }}>{m.icon}</span>
                              <span className="text-xs">{m.label}</span>
                            </div>
                            <p className="font-mono text-base font-semibold" style={{ color: m.color }}>{m.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Extended metrics */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 divide-x border-t" style={{ borderColor: "var(--border)" }}>
                        {[
                          { label: "Sortino Ratio", value: fmtNum(metrics.sortino_ratio) },
                          { label: "Calmar Ratio",  value: fmtNum(metrics.calmar_ratio) },
                          { label: "Beta vs S&P",   value: fmtNum(metrics.beta) },
                        ].map(m => (
                          <div key={m.label} className="px-4 py-3" style={{ background: "var(--bg-card)" }}>
                            <p className="text-xs mb-1" style={{ color: "var(--t3)" }}>{m.label}</p>
                            <p className="font-mono text-sm font-semibold" style={{ color: "var(--t1)" }}>{m.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Allocation table */}
                  <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                    <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                        Allocation — {Object.keys(weights).length} positions
                      </span>
                    </div>
                    <table className="w-full text-xs" style={{ background: "var(--bg-card)" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {["Ticker", "Weight", "Amount (€)", "Bar"].map(h => (
                            <th key={h} className="px-5 py-2.5 text-left font-semibold tracking-widest" style={{ color: "var(--t3)", fontSize: 10 }}>
                              {h.toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(weights)
                          .sort(([, a], [, b]) => b - a)
                          .map(([tkr, w]) => (
                            <tr key={tkr} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td className="px-5 py-2.5 font-mono font-semibold" style={{ color: "var(--orange)" }}>{tkr}</td>
                              <td className="px-5 py-2.5 font-mono" style={{ color: "var(--t1)" }}>{fmtPct(w)}</td>
                              <td className="px-5 py-2.5 font-mono" style={{ color: "var(--t2)" }}>
                                {fmtEur(w * (selected.capital ?? 0))}
                              </td>
                              <td className="px-5 py-2.5 w-36">
                                <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--bg-hover)" }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${w * 100}%`, background: "var(--orange)" }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Report settings */}
                  <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                    <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                        Report Settings
                      </span>
                    </div>
                    <div className="px-5 py-4 grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs" style={{ color: "var(--t3)" }}>Monte Carlo simulations</label>
                        <select
                          value={nSims}
                          onChange={e => setNSims(parseInt(e.target.value))}
                          className="w-full text-xs px-3 py-2 rounded border outline-none transition-colors"
                          style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                        >
                          <option value={250}>250 — Fast</option>
                          <option value={500}>500 — Standard</option>
                          <option value={1000}>1 000 — Precise</option>
                          <option value={2000}>2 000 — High precision</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs" style={{ color: "var(--t3)" }}>Report contents</label>
                        <div className="space-y-1.5 pt-1">
                          {[
                            "Cover page — portfolio summary",
                            "Risk metrics table",
                            "Capital allocation table",
                            `Monte Carlo fan chart (${nSims} paths)`,
                            "VaR 95% / CVaR 95%",
                            "Allocation bar chart",
                          ].map(item => (
                            <div key={item} className="flex items-center gap-2">
                              <CheckSquare size={11} style={{ color: "var(--green)", flexShrink: 0 }} />
                              <span className="text-xs" style={{ color: "var(--t2)" }}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Generate button */}
                    <div className="px-5 pb-5">
                      <button
                        onClick={() => generatePdf.mutate()}
                        disabled={generatePdf.isPending || !canGenerate}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded font-semibold text-sm transition-all disabled:opacity-40"
                        style={{ background: "var(--orange)", color: "var(--bg-base)" }}
                      >
                        {generatePdf.isPending
                          ? <><LoadingSpinner size="sm" /> Generating PDF… (MC running)</>
                          : <><FileText size={14} /> Generate Institutional Report — {selected.name}</>
                        }
                      </button>
                      {!selected.result && (
                        <p className="text-xs text-center mt-2 flex items-center justify-center gap-1.5" style={{ color: "var(--yellow)" }}>
                          <AlertTriangle size={12} />
                          This portfolio has no saved optimization result. Run optimization first.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="flex items-center justify-center h-64 rounded border"
                  style={{ borderColor: "var(--border)", borderStyle: "dashed", background: "var(--bg-card)" }}
                >
                  <p className="text-xs" style={{ color: "var(--t3)" }}>Select a portfolio on the left.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
