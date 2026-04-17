"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import type {
  ForexWatchlistEntry,
  ForexIndices,
  ForexYieldCurves,
  ForexCorrelations,
  RetailSentiment,
  CotEntry,
} from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import type { Data } from "plotly.js";
import { SkeletonChart, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

type Tab = "market" | "positioning" | "correlations";
type ZoneKey = "US" | "EU" | "JP";

const FX_COLORS: Record<string, string> = {
  "DXY":     "#3B82F6",
  "EUR/USD": "#10B981",
  "GBP/USD": "#A855F7",
  "USD/JPY": "#F5A623",
  "USD/CHF": "#EF4444",
  "AUD/USD": "#14B8A6",
  "USD/CAD": "#EC4899",
  "NZD/USD": "#F59E0B",
};

const ZONE_COLOR: Record<ZoneKey, string> = {
  US: "#3B82F6",
  EU: "#10B981",
  JP: "#F5A623",
};

const FX_COT_RE = /EURO|YEN|POUND|FRANC|DOLLAR|STERLING|CANADIAN|AUSTRALIAN|NEW ZEALAND|SWISS|GBP|JPY|EUR|AUD|CAD|NZD|CHF/i;

function priceFmt(pair: string, price: number): string {
  if (pair === "USD/JPY" || pair === "GBP/JPY" || pair === "EUR/JPY") {
    return price.toFixed(3);
  }
  if (pair === "DXY") return price.toFixed(3);
  return price.toFixed(5);
}

export default function ForexPage() {
  const [activeTab, setActiveTab]   = useState<Tab>("market");
  const [yieldZone, setZoneKey]   = useState<ZoneKey>("US");

  // --- Market tab queries ---
  const watchlist = useQuery<ForexWatchlistEntry[]>({
    queryKey: ["forex-watchlist"],
    queryFn: () => get("/forex/watchlist"),
    staleTime: 300_000,
    refetchInterval: 300_000,
    enabled: activeTab === "market",
  });

  const indices = useQuery<ForexIndices>({
    queryKey: ["forex-indices"],
    queryFn: () => get("/forex/indices"),
    staleTime: 3600_000,
    enabled: activeTab === "market",
  });

  const yieldCurves = useQuery<ForexYieldCurves>({
    queryKey: ["forex-yield-curves"],
    queryFn: () => get("/forex/yield_curves"),
    staleTime: 3600_000,
    enabled: activeTab === "market",
  });

  // --- Positioning tab queries ---
  const cot = useQuery<CotEntry[]>({
    queryKey: ["macro-cot"],
    queryFn: () => get("/macro/cot"),
    staleTime: 3600_000,
    enabled: activeTab === "positioning",
    retry: false,
  });

  const retail = useQuery<RetailSentiment>({
    queryKey: ["forex-retail"],
    queryFn: () => get("/forex/retail_sentiment"),
    staleTime: 3600_000,
    enabled: activeTab === "positioning",
    retry: false,
  });

  // --- Correlations query ---
  const correlations = useQuery<ForexCorrelations>({
    queryKey: ["forex-correlations"],
    queryFn: () => get("/forex/correlations"),
    staleTime: 3600_000,
    enabled: activeTab === "correlations",
  });

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        {/* Header */}
        <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
          Forex — Currency Markets
        </h1>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-bg-border">
          {(
            [
              ["market",       "MARKET & RATES"],
              ["positioning",  "POSITIONING"],
              ["correlations", "CORRELATIONS"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "pb-2 text-xs tracking-widest uppercase transition-colors border-b-2 -mb-px",
                activeTab === id
                  ? "text-accent-blue border-accent-blue"
                  : "text-text-secondary border-transparent hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ================================================================ */}
        {/* TAB: MARKET & RATES                                               */}
        {/* ================================================================ */}
        {activeTab === "market" && (
          <div className="space-y-6">

            {/* WATCHLIST */}
            <section>
              <SectionLabel>MAJOR FX PAIRS — WATCHLIST</SectionLabel>
              {watchlist.isLoading ? (
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-16" />
                  ))}
                </div>
              ) : watchlist.error ? (
                <QueryError error={watchlist.error as Error} onRetry={() => watchlist.refetch()} />
              ) : watchlist.data && watchlist.data.length > 0 ? (
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {watchlist.data.map((entry) => (
                    <WatchlistCard key={entry.pair} entry={entry} />
                  ))}
                </div>
              ) : null}
            </section>

            <hr className="section-divider" />

            {/* BASE-100 CHART */}
            <section>
              <SectionLabel>CURRENCY INDICES — BASE 100 (1Y)</SectionLabel>
              {indices.isLoading ? (
                <SkeletonChart height={380} />
              ) : indices.error ? (
                <QueryError error={indices.error as Error} onRetry={() => indices.refetch()} />
              ) : indices.data ? (
                <PlotlyChart
                  data={buildIndicesChart(indices.data)}
                  layout={{ height: 380, yaxis: { title: { text: "Base 100" } } }}
                  height={380}
                />
              ) : null}
            </section>

            <hr className="section-divider" />

            {/* YIELD CURVES */}
            <section>
              <div className="flex items-center gap-4 mb-4">
                <SectionLabel>SOVEREIGN YIELD CURVES</SectionLabel>
                <div className="flex gap-2">
                  {(["US", "EU", "JP"] as ZoneKey[]).map((z) => (
                    <button
                      key={z}
                      onClick={() => setZoneKey(z)}
                      className={cn(
                        "px-3 py-1 text-xs border transition-colors",
                        yieldZone === z
                          ? "border-accent-blue text-accent-blue bg-bg-secondary"
                          : "border-bg-border text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              </div>

              {yieldCurves.isLoading ? (
                <>
                  <SkeletonChart height={260} />
                  <SkeletonChart height={240} />
                </>
              ) : yieldCurves.error ? (
                <QueryError error={yieldCurves.error as Error} onRetry={() => yieldCurves.refetch()} />
              ) : yieldCurves.data ? (
                <ZoneKeyPanel data={yieldCurves.data[yieldZone]} zone={yieldZone} />
              ) : null}
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB: POSITIONING                                                  */}
        {/* ================================================================ */}
        {activeTab === "positioning" && (
          <div className="space-y-6">

            {/* COT */}
            <section>
              <SectionLabel>COT — FX INSTITUTIONAL POSITIONING</SectionLabel>
              <p className="text-text-muted text-xs mt-1 mb-3">
                CFTC Commitment of Traders — net speculative positions on FX futures.
                Sync data from Macro View if empty.
              </p>
              {cot.isLoading ? (
                <SkeletonChart height={360} />
              ) : cot.error ? (
                <div className="text-text-secondary text-xs p-4 bg-bg-secondary border border-bg-border">
                  No COT data. Go to Macro View → Sentiment → SYNC COT DATA.
                </div>
              ) : cot.data && cot.data.length > 0 ? (
                <PlotlyChart data={buildFxCotChart(cot.data)} height={360} />
              ) : (
                <div className="text-text-secondary text-xs p-4 bg-bg-secondary border border-bg-border">
                  No COT data loaded. Go to Macro View → Sentiment → SYNC COT DATA.
                </div>
              )}
            </section>

            <hr className="section-divider" />

            {/* RETAIL SENTIMENT */}
            <section>
              <SectionLabel>RETAIL POSITIONING — MYFXBOOK COMMUNITY OUTLOOK</SectionLabel>
              {retail.isLoading ? (
                <SkeletonChart height={360} />
              ) : retail.error ? (
                <QueryError error={retail.error as Error} onRetry={() => retail.refetch()} />
              ) : retail.data ? (
                retail.data.configured ? (
                  retail.data.data.length > 0 ? (
                    <PlotlyChart data={buildRetailChart(retail.data.data)} height={380} />
                  ) : (
                    <div className="text-text-secondary text-xs p-4 bg-bg-secondary border border-bg-border">
                      {retail.data.error ?? "No data returned from myfxbook."}
                    </div>
                  )
                ) : (
                  <div className="bg-bg-secondary border border-bg-border p-6 space-y-3 mt-3">
                    <div className="text-text-primary text-xs font-semibold uppercase tracking-widest">
                      Configuration required
                    </div>
                    <p className="text-text-secondary text-xs leading-5">
                      Add your myfxbook credentials to <code className="text-accent-blue">.env</code>:
                    </p>
                    <pre className="text-xs text-text-primary bg-bg-tertiary border border-bg-border p-3">
{`MYFXBOOK_EMAIL=your@email.com
MYFXBOOK_PASSWORD=yourpassword`}
                    </pre>
                    <p className="text-text-muted text-xs">Restart backend after adding credentials.</p>
                  </div>
                )
              ) : null}
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB: CORRELATIONS                                                 */}
        {/* ================================================================ */}
        {activeTab === "correlations" && (
          <div className="space-y-4">
            <SectionLabel>CORRELATION MATRIX — FX + COMMODITIES (1Y DAILY LOG-RETURNS)</SectionLabel>
            {correlations.isLoading ? (
              <SkeletonChart height={500} />
            ) : correlations.error ? (
              <QueryError error={correlations.error as Error} onRetry={() => correlations.refetch()} />
            ) : correlations.data ? (
              <PlotlyChart
                data={buildCorrelationHeatmap(correlations.data)}
                layout={{
                  height: 540,
                  margin: { l: 120, r: 40, t: 40, b: 120 },
                }}
                height={540}
              />
            ) : null}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-secondary text-xs uppercase tracking-widest font-medium">
      {children}
    </div>
  );
}

function WatchlistCard({ entry }: { entry: ForexWatchlistEntry }) {
  const positive = entry.change_pct >= 0;
  /* Semantic color on numeric data only — not on card structure */
  const deltaColor = positive ? "var(--green)" : "var(--red)";
  return (
    <div className="metric-card">
      <div className="mc-label flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span>{entry.pair}</span>
        {positive
          ? <TrendingUp size={11} style={{ color: "var(--t3)", flexShrink: 0 }} />
          : <TrendingDown size={11} style={{ color: "var(--t3)", flexShrink: 0 }} />
        }
      </div>
      <div className="mc-value" style={{ fontSize: "1.3rem" }}>
        {priceFmt(entry.pair, entry.price)}
      </div>
      <div className="mc-sub" style={{ marginTop: 8, paddingTop: 8 }}>
        <span style={{ color: deltaColor, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 500 }}>
          {positive ? "▲ +" : "▼ "}{entry.change_pct.toFixed(2)}%
        </span>
        <span style={{ color: "var(--t3)", fontSize: "0.67rem" }}>
          ({positive ? "+" : ""}{entry.change_abs > 0.001 ? entry.change_abs.toFixed(4) : entry.change_abs.toFixed(6)})
        </span>
      </div>
    </div>
  );
}

function ZoneKeyPanel({
  data,
  zone,
}: {
  data: ForexYieldCurves["US"];
  zone: ZoneKey;
}) {
  const color = ZONE_COLOR[zone];
  const validRates = data.rates.filter((r) => r !== null);

  const hasSnapshot = validRates.length > 0;
  const hasHistory = data.history_10y.dates.length > 0;
  const bothPresent = hasSnapshot && hasHistory;

  return (
    <div className={bothPresent ? "grid grid-cols-2 gap-4" : "space-y-5"}>
      {hasSnapshot && (
        <div>
          <div className="text-text-secondary text-xs uppercase tracking-widest font-medium mb-3">
            {zone} — CURRENT CURVE SNAPSHOT
          </div>
          <PlotlyChart
            data={[
              {
                type: "scatter",
                mode: "lines+markers",
                x: data.maturities,
                y: data.rates,
                name: `${zone} Yield Curve`,
                line: { color, width: 2 },
                marker: { color, size: 6 },
                hovertemplate: "%{x}: %{y:.2f}%<extra></extra>",
              },
            ]}
            layout={{ height: 280, yaxis: { title: { text: "Yield (%)" } } }}
            height={280}
          />
        </div>
      )}

      {hasHistory && (
        <div>
          <div className="text-text-secondary text-xs uppercase tracking-widest font-medium mb-3">
            {zone} — 10Y SOVEREIGN YIELD HISTORICAL
          </div>
          <PlotlyChart
            data={[
              {
                type: "scatter",
                mode: "lines",
                x: data.history_10y.dates,
                y: data.history_10y.values,
                name: `${zone} 10Y`,
                line: { color, width: 1.5 },
                hovertemplate: "%{x}<br>10Y: %{y:.2f}%<extra></extra>",
              },
            ]}
            layout={{ height: 280, yaxis: { title: { text: "Yield (%)" } } }}
            height={280}
          />
        </div>
      )}

      {!hasSnapshot && !hasHistory && (
        <div className="text-text-secondary text-xs p-4 bg-bg-secondary border border-bg-border col-span-2">
          No yield data available for {zone}. Check FRED_API_KEY.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart builders
// ---------------------------------------------------------------------------
function buildIndicesChart(data: ForexIndices) {
  return Object.entries(data.series).map(([label, values]) => ({
    type: "scatter" as const,
    mode: "lines" as const,
    x: data.dates,
    y: values,
    name: label,
    line: { color: FX_COLORS[label] ?? "#8B949E", width: 1.5 },
    hovertemplate: `${label}: %{y:.2f}<extra></extra>`,
  }));
}

function buildFxCotChart(data: CotEntry[]) {
  const assetKey = "MARKET ASSET" in (data[0] ?? {}) ? "MARKET ASSET" : "ASSET";
  let filtered = data.filter((d) =>
    FX_COT_RE.test(String(d[assetKey as keyof CotEntry] ?? ""))
  );
  if (!filtered.length) filtered = data.slice(0, 20);
  filtered = [...filtered].sort((a, b) => a.NET_POSITION - b.NET_POSITION);

  return [
    {
      type: "bar" as const,
      orientation: "h" as const,
      x: filtered.map((d) => d.NET_POSITION),
      y: filtered.map((d) => String(d[assetKey as keyof CotEntry] ?? "")),
      marker: { color: filtered.map((d) => (d.NET_POSITION > 0 ? "#2ECC40" : "#FF4136")) },
      text: filtered.map((d) =>
        `${d.NET_POSITION > 0 ? "+" : ""}${d.NET_POSITION.toLocaleString()}`
      ),
      textposition: "outside" as const,
      textfont: { color: "#E6EDF3", size: 10 },
      hovertemplate: "%{y}<br>Net: %{x:,.0f}<extra></extra>",
    },
  ];
}

function buildRetailChart(data: RetailSentiment["data"]) {
  const sorted = [...data].sort((a, b) => (b.long_pct ?? 0) - (a.long_pct ?? 0));
  return [
    {
      type: "bar" as const,
      orientation: "h" as const,
      name: "LONG %",
      x: sorted.map((d) => d.long_pct ?? 0),
      y: sorted.map((d) => d.symbol),
      marker: { color: "#2ECC40" },
      hovertemplate: "%{y} Long: %{x:.1f}%<extra></extra>",
    },
    {
      type: "bar" as const,
      orientation: "h" as const,
      name: "SHORT %",
      x: sorted.map((d) => -(d.short_pct ?? 0)),
      y: sorted.map((d) => d.symbol),
      marker: { color: "#FF4136" },
      hovertemplate: "%{y} Short: %{x:.1f}%<extra></extra>",
    },
  ];
}

function buildCorrelationHeatmap(data: ForexCorrelations) {
  return [
    {
      type: "heatmap" as const,
      x: data.labels,
      y: data.labels,
      z: data.matrix,
      text: data.matrix.map((row) => row.map((v) => v.toFixed(2))),
      texttemplate: "%{text}",
      textfont: { size: 10, color: "#E6EDF3" },
      colorscale: [
        [0,   "#EF4444"],
        [0.5, "#1E232F"],
        [1,   "#3B82F6"],
      ] as [number, string][],
      zmin: -1,
      zmax: 1,
      showscale: true,
      colorbar: {
        thickness: 12,
        tickfont: { size: 9, color: "#8B949E" },
        tickvals: [-1, -0.5, 0, 0.5, 1],
      },
      hovertemplate: "%{x} / %{y}: %{z:.2f}<extra></extra>",
    } as unknown as Partial<Data>,
  ];
}
