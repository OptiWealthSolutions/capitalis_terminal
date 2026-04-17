"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { downloadPdf } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { triggerBlobDownload } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FileText, Plus, Trash2, Download } from "lucide-react";
import toast from "react-hot-toast";

interface TickerWeight { ticker: string; weight: string }

export default function ReportingPage() {
  const [portfolioName, setPortfolioName] = useState("My Portfolio");
  const [capital, setCapital] = useState(20000);
  const [rows, setRows] = useState<TickerWeight[]>([
    { ticker: "NVDA", weight: "0.30" },
    { ticker: "MSFT", weight: "0.25" },
    { ticker: "GOOG", weight: "0.25" },
    { ticker: "BRK-B", weight: "0.20" },
  ]);
  const [nSimulations, setNSimulations] = useState(500);

  const addRow = () => setRows((prev) => [...prev, { ticker: "", weight: "0.00" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));
  const updateRow = (i: number, field: keyof TickerWeight, val: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: val } : r)));

  const totalWeight = rows.reduce((s, r) => s + parseFloat(r.weight || "0"), 0);
  const totalOk = Math.abs(totalWeight - 1.0) <= 0.01;
  const allTickers = rows.every((r) => r.ticker.trim() !== "");

  const generatePdf = useMutation({
    mutationFn: () =>
      downloadPdf("/reporting/generate-pdf", {
        portfolio_name: portfolioName,
        tickers: rows.map((r) => r.ticker.trim().toUpperCase()),
        weights: rows.map((r) => parseFloat(r.weight)),
        capital,
        n_simulations: nSimulations,
      }),
    onSuccess: (blob) => {
      const filename = `capitalis_${portfolioName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      triggerBlobDownload(blob, filename);
      toast.success("PDF report downloaded.");
    },
    onError: () => toast.error("PDF generation failed."),
  });

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in max-w-3xl">
        <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
          Institutional Reporting
        </h1>

        {/* Report config */}
        <div className="bg-bg-secondary border border-bg-border p-5 space-y-4">
          <SectionLabel>REPORT PARAMETERS</SectionLabel>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-text-muted text-xs uppercase tracking-wider">Portfolio Name</label>
              <input
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                className="w-full bg-bg-tertiary border border-bg-border text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div className="space-y-1">
              <label className="text-text-muted text-xs uppercase tracking-wider">Capital (EUR)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(parseFloat(e.target.value))}
                className="w-full bg-bg-tertiary border border-bg-border text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div className="space-y-1">
              <label className="text-text-muted text-xs uppercase tracking-wider">Monte Carlo Simulations</label>
              <select
                value={nSimulations}
                onChange={(e) => setNSimulations(parseInt(e.target.value))}
                className="w-full bg-bg-tertiary border border-bg-border text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue"
              >
                <option value={250}>250 (Fast)</option>
                <option value={500}>500 (Standard)</option>
                <option value={1000}>1,000 (Precise)</option>
                <option value={2000}>2,000 (High precision)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Portfolio allocation */}
        <div className="bg-bg-secondary border border-bg-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>PORTFOLIO ALLOCATION</SectionLabel>
            <span className={cn("text-xs", totalOk ? "text-accent-green" : "text-accent-red")}>
              TOTAL: {(totalWeight * 100).toFixed(1)}% {totalOk ? "" : "(must = 100%)"}
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <input
                    value={row.ticker}
                    onChange={(e) => updateRow(i, "ticker", e.target.value.toUpperCase())}
                    placeholder="TICKER"
                    className="w-28 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:border-accent-blue uppercase placeholder:normal-case placeholder:text-text-muted"
                  />
                  <input
                    type="number"
                    value={row.weight}
                    onChange={(e) => updateRow(i, "weight", e.target.value)}
                    step={0.01}
                    min={0}
                    max={1}
                    className="w-24 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:border-accent-blue"
                  />
                  <span className="text-text-secondary text-xs">
                    = {(parseFloat(row.weight || "0") * capital).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </span>
                </div>
                {/* Weight bar */}
                <div className="flex-1 h-1 bg-bg-tertiary rounded overflow-hidden">
                  <div
                    className="h-1 bg-accent-blue rounded transition-all"
                    style={{ width: `${Math.min(parseFloat(row.weight || "0") * 100, 100)}%` }}
                  />
                </div>
                <button onClick={() => removeRow(i)} className="text-text-muted hover:text-accent-red transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          >
            <Plus size={11} /> Add position
          </button>
        </div>

        {/* Report preview info */}
        <div className="bg-bg-secondary border border-bg-border p-4">
          <SectionLabel>REPORT CONTENTS</SectionLabel>
          <ul className="space-y-1 text-text-secondary text-xs list-none">
            {[
              "Portfolio allocation table",
              "Risk metrics: Expected Return, Volatility, Sharpe Ratio",
              `Monte Carlo simulation (${nSimulations} paths, 1Y horizon)`,
              "Value at Risk (VaR 95%) and Conditional VaR",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-accent-blue">—</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Generate button */}
        <button
          onClick={() => generatePdf.mutate()}
          disabled={generatePdf.isPending || !totalOk || !allTickers}
          className="flex items-center justify-center gap-2 w-full py-3 bg-accent-blue hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {generatePdf.isPending ? (
            <><LoadingSpinner size="sm" /> GENERATING PDF...</>
          ) : (
            <><FileText size={14} /> GENERATE INSTITUTIONAL REPORT</>
          )}
        </button>

        {!totalOk && (
          <p className="text-accent-red text-xs text-center">Weights must sum to 100% before generating the report.</p>
        )}
      </div>
    </ErrorBoundary>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-text-secondary text-xs uppercase tracking-widest mb-3">{children}</div>;
}
