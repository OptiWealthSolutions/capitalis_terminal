"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import type { MacroIndicators, RegimeData, GarchData, CotEntry, NewsArticle } from "@/lib/types";
import MetricCard from "@/components/ui/MetricCard";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonBlock, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatNumber, colorForValue } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { RefreshCw, Wifi } from "lucide-react";
import toast from "react-hot-toast";

type Tab = "regime" | "sentiment";
type GarchTicker = "^GSPC" | "^NDX" | "GC=F";

export default function MacroPage() {
  const [activeTab, setActiveTab] = useState<Tab>("regime");
  const [garchTicker, setGarchTicker] = useState<GarchTicker>("^GSPC");
  const qc = useQueryClient();

  // --- Data queries ---
  const indicators = useQuery<MacroIndicators>({
    queryKey: ["macro-indicators"],
    queryFn: () => get("/macro/indicators"),
    staleTime: 86400_000,
  });

  const regime = useQuery<RegimeData>({
    queryKey: ["macro-regime"],
    queryFn: () => get("/macro/regime"),
    staleTime: 3600_000,
  });

  const garch = useQuery<GarchData>({
    queryKey: ["macro-garch", garchTicker],
    queryFn: () => get(`/macro/garch/${encodeURIComponent(garchTicker)}`),
    staleTime: 3600_000,
  });

  const cot = useQuery<CotEntry[]>({
    queryKey: ["macro-cot"],
    queryFn: () => get("/macro/cot"),
    staleTime: 3600_000,
    enabled: activeTab === "sentiment",
    retry: false,
  });

  const news = useQuery<NewsArticle[]>({
    queryKey: ["macro-news"],
    queryFn: () => get("/macro/news?limit=12"),
    staleTime: 1800_000,
    enabled: activeTab === "sentiment",
  });

  const cotSync = useMutation({
    mutationFn: () => post("/macro/cot/sync"),
    onSuccess: () => {
      toast.success("COT data synchronized.");
      qc.invalidateQueries({ queryKey: ["macro-cot"] });
    },
    onError: () => toast.error("COT sync failed."),
  });

  // --- Regime chart data ---
  const regimeChartData = regime.data
    ? [
        {
          type: "scatter" as const,
          mode: "lines" as const,
          x: regime.data.dates,
          y: regime.data.sp500,
          name: "S&P 500",
          line: { color: "#D1D5DB", width: 1.5 },
          hovertemplate: "%{x}<br>S&P 500: %{y:.2f}<extra></extra>",
        },
      ]
    : [];

  const regimeShapes = regime.data
    ? buildRegimeShapes(regime.data)
    : [];

  // --- GARCH chart data ---
  const garchChartData = garch.data
    ? [
        {
          type: "bar" as const,
          x: garch.data.abs_returns_dates,
          y: garch.data.abs_returns_series,
          name: "ABS LOG RETURNS",
          marker: { color: "rgba(209,213,219,0.15)" },
          hoverinfo: "skip" as const,
        },
        {
          type: "scatter" as const,
          mode: "lines" as const,
          x: garch.data.dates,
          y: garch.data.conditional_vol_series,
          name: "CONDITIONAL VOL",
          line: { color: "#F5A623", width: 2 },
          hovertemplate: "%{x}<br>Cond. Vol: %{y:.4f}%<extra></extra>",
        },
      ]
    : [];

  // --- COT chart ---
  const cotChartData = buildCotChart(cot.data);

  const isBear = regime.data?.current_regime === 1;

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
            Macro-Economic View
          </h1>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["macro-regime"] });
              qc.invalidateQueries({ queryKey: ["macro-indicators"] });
              qc.invalidateQueries({ queryKey: ["macro-garch"] });
            }}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} />
            PURGE CACHE
          </button>
        </div>

        {/* GLOBAL INDICATORS */}
        <section>
          <SectionLabel>GLOBAL MACROECONOMIC INDICATORS</SectionLabel>
          {indicators.isLoading ? (
            <div className="grid grid-cols-3 gap-4 mt-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonBlock key={i} className="h-28" />)}
            </div>
          ) : indicators.error ? (
            <QueryError error={indicators.error as Error} onRetry={() => indicators.refetch()} />
          ) : (
            <div className="grid grid-cols-3 gap-4 mt-3">
              <RegionBlock label="UNITED STATES (USD)" color="#3B82F6" data={indicators.data!.US} />
              <RegionBlock label="EUROZONE (EUR)"       color="#10B981" data={indicators.data!.EU} />
              <RegionBlock label="JAPAN (JPY)"          color="#F5A623" data={indicators.data!.JP} />
              <RegionBlock label="CHINA (CNY)"          color="#EF4444" data={indicators.data!.CN} />
              <RegionBlock label="UNITED KINGDOM (GBP)" color="#A855F7" data={indicators.data!.GB} />
              <RegionBlock label="CANADA (CAD)"         color="#14B8A6" data={indicators.data!.CA} />
            </div>
          )}
        </section>

        <hr className="section-divider" />

        {/* TABS */}
        <div className="flex gap-6 border-b border-bg-border">
          {(["regime", "sentiment"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "pb-2 text-xs tracking-widest uppercase transition-colors border-b-2 -mb-px",
                activeTab === t
                  ? "text-accent-blue border-accent-blue"
                  : "text-text-secondary border-transparent hover:text-text-primary"
              )}
            >
              {t === "regime" ? "REGIME ANALYSIS" : "SENTIMENT & NEWS"}
            </button>
          ))}
        </div>

        {/* --- TAB: REGIME --- */}
        {activeTab === "regime" && (
          <div className="space-y-5">
            {/* Current regime KPIs */}
            {regime.isLoading ? (
              <div className="grid grid-cols-2 gap-4">
                <SkeletonBlock className="h-20" />
                <SkeletonBlock className="h-20" />
              </div>
            ) : regime.error ? (
              <QueryError error={regime.error as Error} onRetry={() => regime.refetch()} />
            ) : regime.data ? (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  label="CURRENT REGIME"
                  value={regime.data.current_regime_label}
                  accentColor={isBear ? "orange" : "blue"}
                />
                <MetricCard
                  label="BULL PROBABILITY"
                  value={`${(regime.data.current_prob_bull * 100).toFixed(1)}%`}
                  accentColor={regime.data.current_prob_bull > 0.5 ? "green" : "red"}
                />
              </div>
            ) : null}

            {/* Regime chart */}
            <div>
              <SectionLabel>MARKET REGIME — S&P 500</SectionLabel>
              {regime.isLoading ? <SkeletonChart height={380} /> : (
                <PlotlyChart
                  data={regimeChartData}
                  layout={{ shapes: regimeShapes, height: 380 }}
                  height={380}
                />
              )}
            </div>

            {/* GARCH section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>VOLATILITY MODELLING (GARCH)</SectionLabel>
                <select
                  value={garchTicker}
                  onChange={(e) => setGarchTicker(e.target.value as GarchTicker)}
                  className="bg-bg-tertiary border border-bg-border text-text-primary text-xs px-2 py-1 focus:outline-none focus:border-accent-blue"
                >
                  <option value="^GSPC">S&P 500</option>
                  <option value="^NDX">NASDAQ 100</option>
                  <option value="GC=F">GOLD</option>
                </select>
              </div>

              {garch.isLoading ? (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-20" />)}
                  </div>
                  <SkeletonChart height={360} />
                </>
              ) : garch.error ? (
                <QueryError error={garch.error as Error} onRetry={() => garch.refetch()} />
              ) : garch.data ? (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <MetricCard label="REALIZED VOL (30D)" value={`${(garch.data.realized_vol_30d * 100).toFixed(2)}%`} accentColor="blue" />
                    <MetricCard label="CONDITIONAL VOL (TODAY)" value={`${garch.data.conditional_vol_current.toFixed(2)}%`} accentColor="blue" />
                    <MetricCard label="GARCH FORECAST (T+1)" value={`${garch.data.forecast_t1.toFixed(2)}%`} accentColor="orange" />
                  </div>
                  <PlotlyChart data={garchChartData} height={360} />
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* --- TAB: SENTIMENT --- */}
        {activeTab === "sentiment" && (
          <div className="space-y-5">
            {/* COT */}
            <div className="flex items-center justify-between">
              <SectionLabel>INSTITUTIONAL POSITIONING (COT)</SectionLabel>
              <button
                onClick={() => cotSync.mutate()}
                disabled={cotSync.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent-blue text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {cotSync.isPending ? <LoadingSpinner size="sm" /> : <Wifi size={11} />}
                {cotSync.isPending ? "SYNCING..." : "SYNC COT DATA"}
              </button>
            </div>

            {cot.isLoading ? <SkeletonChart height={360} /> :
             cot.error ? (
               <div className="text-text-secondary text-xs p-4 bg-bg-secondary border border-bg-border rounded-md">
                 No COT data on disk. Click SYNC COT DATA to fetch from CFTC.
               </div>
             ) : cot.data && cot.data.length > 0 ? (
               <div style={{ maxHeight: 360, overflow: "hidden" }}>
                 <PlotlyChart data={cotChartData} height={360} />
               </div>
             ) : null}

            <hr className="section-divider" />

            {/* News */}
            <SectionLabel>MACRO INTELLIGENCE STREAM</SectionLabel>
            {news.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-24" />)}
              </div>
            ) : news.error ? (
              <QueryError error={news.error as Error} onRetry={() => news.refetch()} />
            ) : news.data && news.data.length > 0 ? (
              <div className="space-y-3">
                {news.data.map((art, i) => (
                  <a
                    key={i}
                    href={art.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-bg-secondary border border-bg-border p-4 hover:border-accent-blue transition-colors"
                  >
                    <div className="text-text-primary text-xs font-medium mb-1 line-clamp-2">{art.title}</div>
                    <div className="flex items-center gap-3 text-text-muted text-xs">
                      <span>{art.source}</span>
                      <span className={sentimentColor(art.overall_sentiment_label)}>
                        {art.overall_sentiment_label}
                      </span>
                    </div>
                    {art.summary && (
                      <p className="text-text-secondary text-xs mt-2 line-clamp-2">{art.summary}</p>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-text-secondary text-xs p-4">No news available. Check ALPHA_VANTAGE_API_KEY.</div>
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-secondary text-xs uppercase tracking-widest font-medium mb-3">
      {children}
    </div>
  );
}

function RegionBlock({ label, color: _color, data }: { label: string; color: string; data?: { Rate: string; GDP: string; Unemp: string } }) {
  return (
    <div className="metric-card">
      <div className="mc-label">{label}</div>
      <div className="space-y-2.5">
        <MetricRow label="Central Bank Rate" value={data?.Rate ?? "—"} />
        <MetricRow label="GDP Growth"         value={data?.GDP  ?? "—"} />
        <MetricRow label="Unemployment"       value={data?.Unemp ?? "—"} />
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: "0.8125rem", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function buildRegimeShapes(data: RegimeData) {
  const shapes: object[] = [];
  if (!data.dates.length) return shapes;

  let blockStart = data.dates[0];
  let currentRegime = data.regimes[0];

  for (let i = 1; i < data.dates.length; i++) {
    if (data.regimes[i] !== currentRegime || i === data.dates.length - 1) {
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: blockStart,
        x1: data.dates[i],
        y0: 0,
        y1: 1,
        fillcolor: currentRegime === 1 ? "rgba(245,166,35,0.15)" : "rgba(59,130,246,0.08)",
        line: { width: 0 },
        layer: "below",
      });
      blockStart = data.dates[i];
      currentRegime = data.regimes[i];
    }
  }
  return shapes;
}

function buildCotChart(data: CotEntry[] | undefined) {
  if (!data || !data.length) return [];
  const KEYWORDS = ["S&P", "NASDAQ", "DOW", "RUSSELL", "VIX", "GOLD", "SILVER", "COPPER",
    "CRUDE OIL", "WTI", "BRENT", "NATURAL GAS", "EURO", "YEN", "POUND", "FRANC",
    "DOLLAR", "10-YEAR", "2-YEAR", "TREASURY", "BOND", "BITCOIN"];
  const pattern = new RegExp(KEYWORDS.join("|"), "i");
  const assetKey = "MARKET ASSET" in (data[0] ?? {}) ? "MARKET ASSET" : "ASSET";

  let filtered = data.filter((d) => pattern.test(String(d[assetKey as keyof CotEntry] ?? "")));
  if (!filtered.length) filtered = data;
  filtered = [...filtered].sort((a, b) => Math.abs(b.NET_POSITION) - Math.abs(a.NET_POSITION)).slice(0, 15);
  filtered.sort((a, b) => a.NET_POSITION - b.NET_POSITION);

  return [
    {
      type: "bar" as const,
      orientation: "h" as const,
      x: filtered.map((d) => d.NET_POSITION),
      y: filtered.map((d) => String(d[assetKey as keyof CotEntry] ?? "")),
      marker: { color: filtered.map((d) => d.NET_POSITION > 0 ? "#2ECC40" : "#FF4136") },
      text: filtered.map((d) => `${d.NET_POSITION > 0 ? "+" : ""}${d.NET_POSITION.toLocaleString()}`),
      textposition: "outside" as const,
      textfont: { color: "#E6EDF3", size: 10 },
      hovertemplate: "%{y}<br>Net Position: %{x:,.0f}<extra></extra>",
    },
  ];
}

function sentimentColor(label: string): string {
  if (/bullish/i.test(label)) return "text-accent-green";
  if (/bearish/i.test(label)) return "text-accent-red";
  return "text-text-secondary";
}
