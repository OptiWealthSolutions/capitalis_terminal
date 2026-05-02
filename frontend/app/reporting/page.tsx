"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { downloadPdf, get } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { triggerBlobDownload } from "@/lib/utils";
import {
  FileText, Download, CheckSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SavedPortfolio {
  id: string;
  name: string;
  tickers: string[];
  weights: number[];
  method: string;
  capital: number;
  savedAt: string;
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
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
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nSims, setNSims]           = useState(500);

  useEffect(() => {
    get<{ name: string; tickers: string[]; weights: number[]; capital: number; method: string; created_at: string }[]>(
      "/portfolio/saved"
    )
      .then((rows) => {
        const pfs = rows.map((r) => ({
          id: r.name,
          name: r.name,
          tickers: r.tickers,
          weights: r.weights,
          method: r.method,
          capital: r.capital,
          savedAt: r.created_at,
        }));
        setPortfolios(pfs);
        if (pfs.length > 0) setSelectedId(pfs[0].id);
      })
      .catch(() => {});
  }, []);

  const selected = portfolios.find(p => p.id === selectedId) ?? null;

  // weights dict for allocation table display
  const weightsMap: Record<string, number> = selected
    ? Object.fromEntries(selected.tickers.map((t, i) => [t, selected.weights[i] ?? 0]))
    : {};

  const generatePdf = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No portfolio selected.");
      if (!selected.tickers.length) throw new Error("Portfolio has no tickers.");
      return downloadPdf("/reporting/generate-pdf", {
        portfolio_name: selected.name,
        method: selected.method,
        tickers: selected.tickers,
        weights: selected.weights,
        capital: selected.capital,
        n_simulations: nSims,
        precomputed_metrics: null,
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

  const canGenerate = !!selected && selected.tickers.length > 0;

  // ---------------------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 xl:px-8 max-w-[2000px] mx-auto fade-in">

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
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                      {pf.method} · {pf.tickers.length} assets · {fmtEur(pf.capital)}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* ── Right: preview + settings ── */}
            <div className="col-span-1 lg:col-span-8 space-y-4">

              {selected ? (
                <>
                  {/* Allocation table */}
                  <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                    <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                        Allocation — {Object.keys(weightsMap).length} positions
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
                        {Object.entries(weightsMap)
                          .sort(([, a], [, b]) => b - a)
                          .map(([tkr, w]) => (
                            <tr key={tkr} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td className="px-5 py-2.5 font-semibold" style={{ color: "var(--orange)" }}>{tkr}</td>
                              <td className="px-5 py-2.5" style={{ color: "var(--t1)" }}>{fmtPct(w)}</td>
                              <td className="px-5 py-2.5" style={{ color: "var(--t2)" }}>
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
                            "Historical equity curve (1Y vs SPY)",
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
                          : <><FileText size={14} /> Generate PDF Report — {selected.name}</>
                        }
                      </button>
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
