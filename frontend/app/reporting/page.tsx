"use client";

import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { downloadPdf, get, post } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Card, CardHeader, KpiCard, SectionLabel } from "@/components/ui/Card";
import { triggerBlobDownload } from "@/lib/utils";
import PlotlyChart from "@/components/charts/PlotlyChart";
import {
  Download, TrendingUp, Info, Activity,
  FileText, Clock, Settings, BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";
import type { PerformanceResult, PriceHistory } from "@/lib/types";

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

type DateRange = "MTD" | "QTD" | "YTD" | "1Y" | "ITD";

interface ReportEntry {
  id: string;
  name: string;
  frequency: string;
  generated: string;     // ISO date
  status: "Ready" | "Processing" | "Scheduled";
  portfolio_id: string;
}

const REPORT_HISTORY_KEY = "capitalis_reports_history";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtPctRaw(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}
function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(v);
}
function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function dateRangeToStartDate(r: DateRange): string {
  const d = new Date();
  if (r === "MTD") d.setDate(1);
  else if (r === "QTD") { const m = Math.floor(d.getMonth() / 3) * 3; d.setMonth(m, 1); }
  else if (r === "YTD") d.setMonth(0, 1);
  else if (r === "1Y") d.setFullYear(d.getFullYear() - 1);
  else if (r === "ITD") d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Real KPI derivation from PerformanceResult
// ---------------------------------------------------------------------------
interface DerivedKpis {
  totalReturnPct: number | null;     // %
  alphaBps: number | null;           // bps
  infoRatio: number | null;          // unitless
  trackingErrorPct: number | null;   // %
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownPct: number | null;     // %
  volatilityPct: number | null;      // %
}

function deriveKpis(perf: PerformanceResult | null | undefined): DerivedKpis {
  if (!perf || !perf.portfolio_values?.length || !perf.benchmark_values?.length) {
    return {
      totalReturnPct: null, alphaBps: null, infoRatio: null, trackingErrorPct: null,
      sharpe: null, sortino: null, maxDrawdownPct: null, volatilityPct: null,
    };
  }
  const pv = perf.portfolio_values;
  const bv = perf.benchmark_values;
  const n = Math.min(pv.length, bv.length);

  const portTotal = perf.metrics.total_return; // already a fraction
  const benchTotal = (bv[n - 1] - bv[0]) / bv[0];

  // Daily excess returns
  const dailyExcess: number[] = [];
  for (let i = 1; i < n; i++) {
    const pr = pv[i] / pv[i - 1] - 1;
    const br = bv[i] / bv[i - 1] - 1;
    if (Number.isFinite(pr) && Number.isFinite(br)) dailyExcess.push(pr - br);
  }
  let infoRatio: number | null = null;
  let trackingErrorPct: number | null = null;
  if (dailyExcess.length > 1) {
    const mean = dailyExcess.reduce((a, b) => a + b, 0) / dailyExcess.length;
    const variance = dailyExcess.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyExcess.length;
    const std = Math.sqrt(variance);
    if (std > 0) infoRatio = (mean / std) * Math.sqrt(252);
    trackingErrorPct = std * Math.sqrt(252) * 100;
  }

  return {
    totalReturnPct: portTotal * 100,
    alphaBps: (portTotal - benchTotal) * 10000,
    infoRatio,
    trackingErrorPct,
    sharpe: perf.metrics.sharpe_ratio ?? null,
    sortino: perf.metrics.sortino_ratio ?? null,
    maxDrawdownPct: perf.metrics.max_drawdown != null ? perf.metrics.max_drawdown * 100 : null,
    volatilityPct: perf.metrics.ann_volatility != null ? perf.metrics.ann_volatility * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function DateRangeToggle({
  value, onChange,
}: { value: DateRange; onChange: (v: DateRange) => void }) {
  const opts: DateRange[] = ["MTD", "QTD", "YTD", "1Y", "ITD"];
  return (
    <div style={{
      display: "flex", gap: 2,
      background: "var(--bg-inner)",
      borderRadius: "var(--r-full)",
      padding: "3px",
      border: "1px solid var(--card-border)",
    }}>
      {opts.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            padding: "5px 13px",
            borderRadius: "var(--r-full)",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
            background: value === o ? "var(--orange)" : "transparent",
            color: value === o ? "#fff" : "var(--t2)",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function BenchmarkSelect({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: "SPY",  label: "S&P 500 TR" },
    { v: "QQQ",  label: "Nasdaq 100" },
    { v: "MSCI", label: "MSCI World"  },
    { v: "AGG",  label: "US AGG Bond" },
  ];
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontSize: 12, fontWeight: 600,
        padding: "6px 28px 6px 12px",
        borderRadius: "var(--r-full)",
        border: "1px solid var(--card-border)",
        background: "var(--bg-inner)",
        color: "var(--t1)",
        cursor: "pointer",
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
      }}
    >
      {opts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    Ready:      { bg: "var(--green-dim)",  color: "var(--green)" },
    Processing: { bg: "var(--yellow-dim)", color: "var(--yellow)" },
    Scheduled:  { bg: "var(--bg-inner)",   color: "var(--t3)"    },
  };
  const s = cfg[status] ?? cfg.Scheduled;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      padding: "3px 8px",
      borderRadius: "var(--r-full)",
      background: s.bg,
      color: s.color,
      textTransform: "uppercase",
    }}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ReportingPage() {
  const [portfolios,  setPortfolios]  = useState<SavedPortfolio[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [nSims,       setNSims]       = useState(500);
  const [dateRange,   setDateRange]   = useState<DateRange>("YTD");
  const [benchmark,   setBenchmark]   = useState("SPY");
  const [reports,     setReports]     = useState<ReportEntry[]>([]);

  // Hydrate report history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORT_HISTORY_KEY);
      if (raw) setReports(JSON.parse(raw) as ReportEntry[]);
    } catch { /* ignore */ }
  }, []);

  // Load portfolios
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

  const weightsMap: Record<string, number> = selected
    ? Object.fromEntries(selected.tickers.map((t, i) => [t, selected.weights[i] ?? 0]))
    : {};

  // ── Real performance query ─────────────────────────────────────────────────
  const perfQuery = useQuery<PerformanceResult>({
    queryKey: ["reporting-perf", selected?.id, dateRange],
    enabled:  !!selected && (selected?.tickers.length ?? 0) > 0,
    queryFn:  () => post<PerformanceResult>("/portfolio/performance", {
      tickers:    selected!.tickers,
      weights:    selected!.weights,
      capital:    selected!.capital,
      start_date: dateRangeToStartDate(dateRange),
    }),
    staleTime: 60_000,
    retry: 0,
  });

  const kpis = useMemo(() => deriveKpis(perfQuery.data), [perfQuery.data]);

  // ── Per-position contribution: fetch each ticker's history for the period ─
  const tickers = selected?.tickers ?? [];
  const startDateForRange = dateRangeToStartDate(dateRange);
  const histQueries = useQueries({
    queries: tickers.map((t) => ({
      queryKey: ["reporting-tkr-hist", t, dateRange],
      queryFn:  () => get<PriceHistory>(`/equity/${encodeURIComponent(t)}/history`, {
        period: dateRange === "ITD" ? "10y" : dateRange === "1Y" ? "1y" : "1y",
      }),
      staleTime: 5 * 60_000,
      retry: 0,
      enabled: !!selected && tickers.length > 0,
    })),
  });

  const allHistLoaded = histQueries.length > 0 && histQueries.every(q => q.data || q.isError);
  const positionContribs = useMemo(() => {
    if (!selected || !allHistLoaded) return [];
    const startMs = new Date(startDateForRange).getTime();
    const out: { ticker: string; weight: number; ret: number; contrib: number }[] = [];
    histQueries.forEach((q, i) => {
      const t = tickers[i];
      const w = selected.weights[i] ?? 0;
      const data = q.data;
      if (!data || !data.dates?.length) return;
      // Find first index >= startDate
      let firstIdx = data.dates.findIndex(d => new Date(d).getTime() >= startMs);
      if (firstIdx < 0) firstIdx = 0;
      const first = data.close[firstIdx];
      const last = data.close[data.close.length - 1];
      if (first == null || last == null || first <= 0) return;
      const ret = last / first - 1;
      out.push({ ticker: t, weight: w, ret, contrib: w * ret });
    });
    return out.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).slice(0, 6);
  }, [selected, allHistLoaded, histQueries, tickers, startDateForRange]);

  // ── PDF generation ─────────────────────────────────────────────────────────
  const generatePdf = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No portfolio selected.");
      if (!selected.tickers.length) throw new Error("Portfolio has no tickers.");
      return downloadPdf("/reporting/generate-pdf", {
        portfolio_name:      selected.name,
        method:              selected.method,
        tickers:             selected.tickers,
        weights:             selected.weights,
        capital:             selected.capital,
        n_simulations:       nSims,
        precomputed_metrics: null,
        date_range:          dateRange,
        benchmark,
        kpis: {
          total_return_pct:   kpis.totalReturnPct,
          alpha_bps:          kpis.alphaBps,
          info_ratio:         kpis.infoRatio,
          tracking_error_pct: kpis.trackingErrorPct,
          sharpe:             kpis.sharpe,
          sortino:            kpis.sortino,
          max_drawdown_pct:   kpis.maxDrawdownPct,
          volatility_pct:     kpis.volatilityPct,
        },
      });
    },
    onSuccess: (blob) => {
      const safe = selected?.name.replace(/\s+/g, "_") ?? "portfolio";
      const filename = `capitalis_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
      triggerBlobDownload(blob, filename);
      toast.success("PDF report downloaded.");

      // Persist to history
      const entry: ReportEntry = {
        id: `${selected!.id}-${Date.now()}`,
        name: `${selected!.name} — ${dateRange}`,
        frequency: "On-demand",
        generated: new Date().toISOString(),
        status: "Ready",
        portfolio_id: selected!.id,
      };
      setReports(prev => {
        const next = [entry, ...prev].slice(0, 50);
        try { localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    onError: (e: Error) => toast.error(e.message || "PDF generation failed."),
  });

  const canGenerate = !!selected && selected.tickers.length > 0;

  // ── Re-run mutation: re-download report by re-triggering generation ───────
  const reRun = useMutation({
    mutationFn: (entry: ReportEntry) => {
      const pf = portfolios.find(p => p.id === entry.portfolio_id);
      if (!pf) throw new Error("Portfolio not found.");
      return downloadPdf("/reporting/generate-pdf", {
        portfolio_name: pf.name,
        method:         pf.method,
        tickers:        pf.tickers,
        weights:        pf.weights,
        capital:        pf.capital,
        n_simulations:  nSims,
        precomputed_metrics: null,
        date_range:     dateRange,
        benchmark,
        kpis: null,
      });
    },
    onSuccess: (blob, entry) => {
      const safe = entry.name.replace(/\s+/g, "_");
      triggerBlobDownload(blob, `capitalis_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Report re-downloaded.");
    },
    onError: (e: Error) => toast.error(e.message || "Download failed."),
  });

  // ── Position contribution Plotly data ─────────────────────────────────────
  const contribData = positionContribs.length > 0 ? [{
    type: "bar" as const,
    x: positionContribs.map(p => p.ticker),
    y: positionContribs.map(p => p.contrib * 100),
    marker: {
      color: positionContribs.map(p => p.contrib >= 0 ? "var(--green)" : "var(--red)"),
    },
    hovertemplate: "%{x}<br>Contribution: %{y:.2f}%<br>Weight: %{customdata[0]:.1%}<br>Return: %{customdata[1]:.2%}<extra></extra>",
    customdata: positionContribs.map(p => [p.weight, p.ret]),
  }] : [];

  // ---------------------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div style={{ padding: "24px 28px 48px", maxWidth: 1480, margin: "0 auto" }} className="fade-in">

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexWrap: "wrap", gap: 16, marginBottom: 24,
        }}>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 700, margin: 0,
              fontFamily: "Manrope, DM Sans, sans-serif",
              color: "var(--t1)",
            }}>
              Performance Reporting &amp; Attribution
            </h1>
            <p style={{ fontSize: 13, color: "var(--t3)", margin: "4px 0 0" }}>
              Generate and analyze institutional-grade investment reports.
            </p>
          </div>
          <button
            onClick={() => generatePdf.mutate()}
            disabled={generatePdf.isPending || !canGenerate}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px",
              borderRadius: "var(--r-md)",
              fontSize: 13, fontWeight: 700,
              background: "var(--orange)",
              color: "#fff",
              border: "none",
              cursor: canGenerate ? "pointer" : "not-allowed",
              opacity: (!canGenerate || generatePdf.isPending) ? 0.45 : 1,
              transition: "opacity 0.15s",
              fontFamily: "Manrope, DM Sans, sans-serif",
            }}
          >
            {generatePdf.isPending
              ? <><LoadingSpinner size="sm" /> Generating…</>
              : <><Download size={13} /> Generate PDF Report</>
            }
          </button>
        </div>

        {/* ── Control bar ── */}
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
          marginBottom: 28,
        }}>
          <DateRangeToggle value={dateRange} onChange={setDateRange} />

          <div style={{ position: "relative" }}>
            <BenchmarkSelect value={benchmark} onChange={setBenchmark} />
            <span style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none", fontSize: 10, color: "var(--t3)",
            }}>▾</span>
          </div>

          {portfolios.length > 0 && (
            <div style={{ position: "relative" }}>
              <select
                value={selectedId ?? ""}
                onChange={e => setSelectedId(e.target.value)}
                style={{
                  fontSize: 12, fontWeight: 600,
                  padding: "6px 28px 6px 12px",
                  borderRadius: "var(--r-full)",
                  border: "1px solid var(--card-border)",
                  background: "var(--orange-dim)",
                  color: "var(--orange)",
                  cursor: "pointer",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              >
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                pointerEvents: "none", fontSize: 10, color: "var(--orange)",
              }}>▾</span>
            </div>
          )}

          {perfQuery.isFetching && (
            <span style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 6 }}>
              <LoadingSpinner size="sm" /> Loading metrics…
            </span>
          )}
          {perfQuery.isError && (
            <span style={{ fontSize: 11, color: "var(--red)" }}>
              Performance data unavailable
            </span>
          )}
        </div>

        {/* ── Empty state ── */}
        {portfolios.length === 0 ? (
          <Card variant="ghost" pad="xl" style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 320, gap: 12,
          }}>
            <FileText size={28} style={{ color: "var(--t3)" }} />
            <p style={{ color: "var(--t1)", fontWeight: 600, margin: 0 }}>No portfolios saved</p>
            <p style={{ color: "var(--t3)", fontSize: "0.82rem", margin: 0 }}>
              Run an optimization in the Allocation page and save a portfolio first.
            </p>
          </Card>
        ) : (
          <>
            {/* ── KPI strip (real data) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
              <KpiCard
                label={`Total Return (${dateRange})`}
                value={kpis.totalReturnPct != null
                  ? `${kpis.totalReturnPct >= 0 ? "+" : ""}${kpis.totalReturnPct.toFixed(2)}%`
                  : "—"}
                accent={kpis.totalReturnPct != null && kpis.totalReturnPct >= 0 ? "green" : "red"}
                icon={<TrendingUp size={14} />}
                hint={`vs ${benchmark}`}
              />
              <KpiCard
                label="Alpha vs Benchmark"
                value={kpis.alphaBps != null
                  ? `${kpis.alphaBps >= 0 ? "+" : ""}${kpis.alphaBps.toFixed(0)} bps`
                  : "—"}
                accent={kpis.alphaBps != null && kpis.alphaBps >= 0 ? "green" : "red"}
                icon={<Activity size={14} />}
                hint={kpis.alphaBps != null
                  ? (kpis.alphaBps >= 0 ? "Outperforming" : "Underperforming")
                  : undefined}
              />
              <KpiCard
                label="Information Ratio"
                value={kpis.infoRatio != null ? kpis.infoRatio.toFixed(2) : "—"}
                accent="neutral"
                icon={<Info size={14} />}
                hint="Excess return / TE"
              />
              <KpiCard
                label="Tracking Error"
                value={kpis.trackingErrorPct != null ? `${kpis.trackingErrorPct.toFixed(2)}%` : "—"}
                accent="neutral"
                icon={<Activity size={14} />}
                hint="Annualised σ(excess)"
              />
            </div>

            {/* ── Position Contribution chart ── */}
            <Card pad="none" style={{ marginBottom: 20, overflow: "hidden" }}>
              <CardHeader
                title="Top Position Contributions"
                subtitle={`Weight × period return — ${dateRange}`}
                icon={<BarChart3 size={15} />}
                action={
                  <span style={{ fontSize: 11, color: "var(--t3)" }}>
                    {positionContribs.length} of {tickers.length} positions
                  </span>
                }
              />
              <div style={{ padding: "8px 8px 0" }}>
                {positionContribs.length === 0 ? (
                  <div style={{
                    height: 220, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--t3)", fontSize: 12,
                  }}>
                    {histQueries.some(q => q.isFetching)
                      ? <><LoadingSpinner size="sm" /><span style={{ marginLeft: 8 }}>Loading position data…</span></>
                      : "No contribution data available."}
                  </div>
                ) : (
                  <PlotlyChart
                    card={false}
                    data={contribData}
                    height={260}
                    layout={{
                      margin: { l: 50, r: 16, t: 8, b: 36 },
                      yaxis: { ticksuffix: "%", title: { text: "Contribution (%)" } as never },
                      xaxis: { tickfont: { size: 11 } as never },
                      showlegend: false,
                    }}
                  />
                )}
              </div>
            </Card>

            {/* ── Bottom 2-col section ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 1.4fr)",
              gap: 16, marginBottom: 20,
            }}>

              {/* Risk Metrics card (replaces ESG) — variant=dark for hierarchy */}
              <Card variant="dark" pad="lg" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    fontFamily: "Manrope, DM Sans, sans-serif",
                    color: "var(--t1)",
                  }}>
                    Risk Metrics
                  </span>
                  <SectionLabel>{dateRange}</SectionLabel>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <RiskCell label="Sharpe"        value={fmtNum(kpis.sharpe)} />
                  <RiskCell label="Sortino"       value={fmtNum(kpis.sortino)} />
                  <RiskCell
                    label="Max Drawdown"
                    value={kpis.maxDrawdownPct != null ? `${kpis.maxDrawdownPct.toFixed(2)}%` : "—"}
                    accent="red"
                  />
                  <RiskCell
                    label="Volatility (Ann.)"
                    value={kpis.volatilityPct != null ? `${kpis.volatilityPct.toFixed(2)}%` : "—"}
                  />
                </div>

                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--card-border)",
                  background: "var(--bg-card)",
                }}>
                  <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 500 }}>
                    Observations
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums" }}>
                    {perfQuery.data?.n_days ?? "—"} days
                  </span>
                </div>
              </Card>

              {/* Generated Reports table */}
              <Card pad="none" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <CardHeader
                  title="Generated Reports"
                  subtitle={reports.length > 0
                    ? `${reports.length} report${reports.length === 1 ? "" : "s"} in history`
                    : "No reports yet"}
                />
                {reports.length === 0 ? (
                  <div style={{
                    padding: "32px 20px",
                    textAlign: "center",
                    color: "var(--t3)",
                    fontSize: 12,
                  }}>
                    No reports yet — click <strong style={{ color: "var(--t2)" }}>Generate PDF Report</strong> to create one.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        {["Report Name", "Frequency", "Generated", "Status", ""].map(h => (
                          <th key={h} style={{
                            padding: "8px 12px",
                            textAlign: "left", fontWeight: 600,
                            fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
                            color: "var(--t3)",
                            borderBottom: "1px solid var(--card-border)",
                            background: "var(--bg-inner)",
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                          <td style={{
                            padding: "10px 12px", color: "var(--t1)", fontWeight: 600, fontSize: 11,
                            maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {r.name}
                          </td>
                          <td style={{ padding: "10px 12px", color: "var(--t3)" }}>{r.frequency}</td>
                          <td style={{ padding: "10px 12px", color: "var(--t3)" }}>{fmtDate(r.generated)}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <StatusBadge status={r.status} />
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            {r.status === "Ready" ? (
                              <button
                                onClick={() => reRun.mutate(r)}
                                disabled={reRun.isPending}
                                style={{
                                  background: "transparent", border: "none",
                                  cursor: "pointer", padding: 0,
                                  color: "var(--orange)",
                                  display: "inline-flex", alignItems: "center",
                                  opacity: reRun.isPending ? 0.45 : 1,
                                }}
                                title="Re-download report"
                              >
                                <Download size={14} />
                              </button>
                            ) : r.status === "Processing" ? (
                              <Clock size={14} style={{ color: "var(--yellow)" }} />
                            ) : (
                              <Settings size={14} style={{ color: "var(--t3)" }} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>

            {/* ── Allocation table ── */}
            {selected && Object.keys(weightsMap).length > 0 && (
              <Card pad="none" style={{ overflow: "hidden", marginBottom: 20 }}>
                <CardHeader
                  title={`Allocation — ${Object.keys(weightsMap).length} positions`}
                  subtitle={`${selected.name} · ${selected.method} · ${fmtEur(selected.capital)}`}
                />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Ticker", "Weight", "Amount (€)", "Bar"].map(h => (
                        <th key={h} style={{
                          padding: "8px 16px",
                          textAlign: "left", fontWeight: 600,
                          fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
                          color: "var(--t3)",
                          borderBottom: "1px solid var(--card-border)",
                          background: "var(--bg-inner)",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(weightsMap)
                      .sort(([, a], [, b]) => b - a)
                      .map(([tkr, w]) => (
                        <tr key={tkr} style={{ borderBottom: "1px solid var(--card-border)" }}>
                          <td style={{ padding: "9px 16px", fontWeight: 700, color: "var(--orange)" }}>{tkr}</td>
                          <td style={{ padding: "9px 16px", color: "var(--t1)" }}>{fmtPct(w)}</td>
                          <td style={{ padding: "9px 16px", color: "var(--t2)" }}>
                            {fmtEur(w * (selected.capital ?? 0))}
                          </td>
                          <td style={{ padding: "9px 16px", width: 140 }}>
                            <div style={{
                              height: 4, borderRadius: "var(--r-full)",
                              background: "var(--bg-inner)", overflow: "hidden",
                            }}>
                              <div style={{
                                height: "100%", borderRadius: "var(--r-full)",
                                width: `${w * 100}%`,
                                background: "var(--orange)",
                              }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/* MC simulations picker */}
            <Card pad="md" style={{
              display: "flex", alignItems: "center", gap: 12,
              marginBottom: 20, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>Monte Carlo paths:</span>
              {[250, 500, 1000, 2000].map(n => (
                <button
                  key={n}
                  onClick={() => setNSims(n)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--r-full)",
                    fontSize: 11, fontWeight: 600,
                    border: "1px solid var(--card-border)",
                    cursor: "pointer",
                    background: nSims === n ? "var(--orange)" : "var(--bg-inner)",
                    color: nSims === n ? "#fff" : "var(--t2)",
                    transition: "background 0.12s, color 0.12s",
                  }}
                >
                  {n.toLocaleString()}
                </button>
              ))}
              <span style={{ fontSize: 11, color: "var(--t3)", marginLeft: "auto" }}>
                {nSims === 250 ? "Fast preview" : nSims === 500 ? "Standard" : nSims === 1000 ? "Precise" : "High precision"}
              </span>
            </Card>
          </>
        )}

        {/* ── Footer disclaimer ── */}
        <p style={{
          fontSize: 10, color: "var(--t3)", lineHeight: 1.6,
          borderTop: "1px solid var(--card-border)", paddingTop: 16, marginTop: 8,
        }}>
          Performance KPIs and risk metrics are computed from historical price data via yfinance. Position-level
          contribution is derived from realized weight × period return per ticker. Past performance is not indicative
          of future results.
        </p>

      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Small internal components
// ---------------------------------------------------------------------------
function RiskCell({
  label, value, accent,
}: { label: string; value: string; accent?: "red" | "green" }) {
  const color = accent === "red" ? "var(--red)" : accent === "green" ? "var(--green)" : "var(--t1)";
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: "var(--r-md)",
      background: "var(--bg-card)",
      border: "1px solid var(--card-border)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--t3)",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "Manrope, DM Sans, sans-serif",
        fontSize: 18, fontWeight: 700, color,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
      }}>
        {value}
      </span>
    </div>
  );
}
