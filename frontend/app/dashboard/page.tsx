"use client";

import { useEffect, useMemo, useState } from "react";

type TimeRange = "6mo" | "1y" | "3y" | "5y" | "10y";

function rangeToStartDate(r: TimeRange): string {
  const d = new Date();
  if (r === "6mo") d.setMonth(d.getMonth() - 6);
  else if (r === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (r === "3y") d.setFullYear(d.getFullYear() - 3);
  else if (r === "5y") d.setFullYear(d.getFullYear() - 5);
  else if (r === "10y") d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().split("T")[0];
}
import Link from "next/link";
import PollWidget from "@/components/community/PollWidget";
import CommunityFeedWidget from "@/components/community/CommunityFeedWidget";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Briefcase, Target, Activity,
  CalendarClock, Coins, ArrowRight, BarChart3, Globe, Gauge,
  LineChart, RefreshCw, ChevronDown, ChevronUp, Wallet, Heart,
  Newspaper, ExternalLink, Clock,
} from "lucide-react";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { OptimizationResult, PerformanceResult, TrackerPerfResult, EquityFundamentals } from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useWatchlist } from "@/lib/watchlist";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MarketIndex {
  symbol: string; label: string; price: number;
  change_1d_pct: number; change_5d_pct: number | null;
  change_period_pct: number; spark: number[];
}
interface StressData { score: number; regime: string; components: Record<string, number>; }
interface MarketOverview { indices: MarketIndex[]; stress: StressData; }

interface SavedPortfolio {
  id: string; name: string; tickers: string[]; weights: number[]; method: string;
  capital: number; result: OptimizationResult | null; savedAt: string;
}

interface TrackerPortfolio {
  id: string; name: string; createdAt: string;
  positions: { id: string; ticker: string; shares: number; entry_price: number; entry_date: string }[];
}

interface CorporateEvent {
  ticker: string; next_earnings: string | null;
  next_dividend: string | null; dividend_rate: number | null;
}

const CHART_COLORS = [
  "#7AA7E8", "#86B38A", "#C9B178", "#D48585", "#A97CC0",
  "#5BBCB8", "#E8A87C", "#7CA8D4", "#B5CC8E", "#D4A5A5",
];

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function fmtPct(v: number | undefined | null, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}
function fmtEur(v: number | undefined | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}
function fmtPnl(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)}`;
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime();
  return Math.round((d - new Date().setHours(0,0,0,0)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { watchlist } = useWatchlist();
  const isDark  = theme === "dark";

  // Optimizer portfolios
  const [optPortfolios,    setOptPortfolios]    = useState<SavedPortfolio[]>([]);
  const [selectedOptId,    setSelectedOptId]    = useState<string | null>(null);
  const [perfResult,       setPerfResult]       = useState<PerformanceResult | null>(null);

  // Tracker portfolios
  const [trackerPortfolios, setTrackerPortfolios] = useState<TrackerPortfolio[]>([]);
  const [selectedTrkId,     setSelectedTrkId]     = useState<string | null>(null);
  const [trackerResult,     setTrackerResult]     = useState<TrackerPerfResult | null>(null);

  const [optTimeRange, setOptTimeRange] = useState<TimeRange>("1y");

  // Load portfolios from backend (user-scoped)
  useEffect(() => {
    get<{ name: string; tickers: string[]; weights: number[]; capital: number; method: string; created_at: string }[]>(
      "/portfolio/saved"
    )
      .then((rows) => {
        const opts = rows.map((r) => ({
          id: r.name,
          name: r.name,
          tickers: r.tickers,
          weights: r.weights,
          method: r.method,
          capital: r.capital,
          result: null,
          savedAt: r.created_at,
        }));
        setOptPortfolios(opts);
        if (opts.length > 0) setSelectedOptId(opts[0].id);
      })
      .catch(() => {});

    get<TrackerPortfolio[]>("/portfolio/tracker")
      .then((trks) => {
        setTrackerPortfolios(trks);
        if (trks.length > 0) setSelectedTrkId(trks[0].id);
      })
      .catch(() => {});
  }, []);

  const portfolio      = optPortfolios.find(p => p.id === selectedOptId) ?? null;
  const trackerPf      = trackerPortfolios.find(p => p.id === selectedTrkId) ?? null;

  // Build weights dict from parallel arrays stored in backend
  const weights = useMemo<Record<string, number>>(() => {
    if (!portfolio) return {};
    return Object.fromEntries(
      portfolio.tickers.map((t, i) => [t, portfolio.weights[i] ?? 0])
    );
  }, [portfolio]);

  // Optimizer equity curve
  const perfMutation = useMutation({
    mutationFn: ({ pf, range }: { pf: SavedPortfolio; range: TimeRange }) => {
      if (!pf.tickers.length) throw new Error("No tickers.");
      return post<PerformanceResult>("/portfolio/performance", {
        tickers: pf.tickers,
        weights: pf.weights,
        capital: pf.capital,
        start_date: rangeToStartDate(range),
      });
    },
    onSuccess: (data) => setPerfResult(data),
  });

  // Tracker equity curve
  const trackerMutation = useMutation({
    mutationFn: (pf: TrackerPortfolio) => {
      if (!pf.positions.length) throw new Error("No positions.");
      return post<TrackerPerfResult>("/portfolio/tracker-performance", {
        positions: pf.positions.map(p => ({
          ticker: p.ticker, shares: p.shares,
          entry_price: p.entry_price, entry_date: p.entry_date,
        })),
      });
    },
    onSuccess: (data) => setTrackerResult(data),
  });

  useEffect(() => {
    setPerfResult(null);
    if (portfolio && portfolio.tickers.length > 0) perfMutation.mutate({ pf: portfolio, range: optTimeRange });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOptId, optTimeRange]);

  useEffect(() => {
    setTrackerResult(null);
    if (trackerPf && trackerPf.positions.length > 0) trackerMutation.mutate(trackerPf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrkId]);

  // Corporate events for selected optimizer portfolio
  const tickers    = portfolio?.tickers ?? [];
  const tickersKey = tickers.join(",");
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["events", tickersKey],
    queryFn: () => get<{ events: CorporateEvent[] }>("/equity/events", { tickers: tickersKey }),
    enabled: tickers.length > 0,
    staleTime: 15 * 60 * 1000,
  });

  const { data: market, isLoading: marketLoading, dataUpdatedAt: marketUpdatedAt } = useQuery({
    queryKey: ["market-overview"],
    queryFn: () => get<MarketOverview>("/market/overview"),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const upcoming = useMemo(() => {
    if (!events?.events) return [];
    const rows: { ticker: string; type: "Earnings" | "Dividend"; date: string; extra?: string }[] = [];
    for (const e of events.events) {
      if (e.next_earnings) rows.push({ ticker: e.ticker, type: "Earnings", date: e.next_earnings });
      if (e.next_dividend) rows.push({
        ticker: e.ticker, type: "Dividend", date: e.next_dividend,
        extra: e.dividend_rate ? `$${e.dividend_rate.toFixed(2)}` : undefined,
      });
    }
    return rows
      .filter(r => { const d = daysUntil(r.date); return d !== null && d >= -1 && d <= 180; })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 12);
  }, [events]);

  const pfAgeDays = portfolio
    ? Math.round((Date.now() - new Date(portfolio.savedAt).getTime()) / 86_400_000)
    : null;
  const isStale = pfAgeDays !== null && pfAgeDays > 30;

  const chartLayout = (prefix?: string) => ({
    yaxis: { tickprefix: prefix ?? "€" },
    margin: { l: 64, r: 20, t: 24, b: 40 },
  });

  return (
    <div className="p-4 sm:p-6 xl:px-8 max-w-[2000px] mx-auto fade-in">

      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>{t.dashboard.breadcrumb}</p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>{t.dashboard.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="badge badge-yellow" style={{ fontSize: "0.65rem" }}>
              Optimizer portfolio {pfAgeDays}d old
            </span>
          )}
          <Link href="/portfolio" className="btn-primary" style={{ borderRadius: "var(--r)" }}>
            <Briefcase size={14} /> New allocation
          </Link>
        </div>
      </div>

      {/* ── 2-column layout: main left, watchlist right ── */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-5 mb-5">
        {/* ── LEFT: main content ── */}
        <div className="flex-1 min-w-0">
          <div className="hidden md:block"><PollWidget /></div>

          {optPortfolios.length === 0 && trackerPortfolios.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* ── Mobile-only KPI table (replaces equity curves on small screens) ── */}
              <MobilePortfolioKpis
                className="md:hidden mb-5"
                optimizer={portfolio && perfResult ? { name: portfolio.name, metrics: perfResult.metrics } : optPortfolios[0] ? { name: optPortfolios[0].name, metrics: null } : null}
                tracker={trackerPf && trackerResult ? { name: trackerPf.name, metrics: trackerResult.metrics, positions: trackerPf.positions.length } : trackerPortfolios[0] ? { name: trackerPortfolios[0].name, metrics: null, positions: trackerPortfolios[0].positions.length } : null}
                onRefreshOpt={() => portfolio && perfMutation.mutate({ pf: portfolio, range: optTimeRange })}
                onRefreshTrk={() => trackerPf && trackerMutation.mutate(trackerPf)}
                loadingOpt={perfMutation.isPending}
                loadingTrk={trackerMutation.isPending}
              />

              {/* ── Optimizer Equity Curve (desktop only) ── */}
              {optPortfolios.length > 0 && (
                <section className="mb-5 hidden md:block">
                  <EquityCurveCard
                    title="Optimizer Portfolio"
                    badgeLabel={portfolio?.method}
                    subtitle={`since ${rangeToStartDate(optTimeRange)}${perfResult ? ` · ${perfResult.n_days} trading days` : ""}`}
                    selector={
                      <PortfolioSelect
                        options={optPortfolios.map(p => ({ id: p.id, label: p.name }))}
                        value={selectedOptId ?? ""}
                        onChange={id => { setSelectedOptId(id); setPerfResult(null); }}
                      />
                    }
                    onRefresh={() => portfolio && perfMutation.mutate({ pf: portfolio, range: optTimeRange })}
                    refreshing={perfMutation.isPending}
                    timeRange={optTimeRange}
                    onTimeRangeChange={r => { setOptTimeRange(r); setPerfResult(null); }}
                  >
                    {perfMutation.isPending && !perfResult && (
                      <div className="px-5 py-3"><div className="skeleton" style={{ height: 200 }} /></div>
                    )}
                    {perfResult && (
                      <>
                        <KpiStrip items={[
                          { label: "Total Return",   value: fmtPct(perfResult.metrics.total_return),    color: perfResult.metrics.total_return >= 0 ? "var(--green)" : "var(--red)" },
                          { label: "Current Value",  value: fmtEur(perfResult.metrics.current_value),   color: "var(--orange)" },
                          { label: "Ann. Return",    value: fmtPct(perfResult.metrics.ann_return),       color: (perfResult.metrics.ann_return ?? 0) >= 0 ? "var(--green)" : "var(--red)" },
                          { label: "Volatility",     value: fmtPct(perfResult.metrics.ann_volatility),   color: "var(--yellow)" },
                          { label: "Sharpe Ratio",   value: fmtNum(perfResult.metrics.sharpe_ratio, 3),  color: "var(--orange)" },
                          { label: "Max Drawdown",   value: fmtPct(perfResult.metrics.max_drawdown),     color: "var(--red)" },
                        ]} />
                        <PlotlyChart
                          data={[
                            {
                              type: "scatter", mode: "lines",
                              x: perfResult.dates, y: perfResult.portfolio_values,
                              name: portfolio?.name ?? "Portfolio",
                              line: { color: "#7AA7E8", width: 2 },
                              fill: "tozeroy",
                              fillcolor: isDark ? "rgba(122,167,232,0.06)" : "rgba(62,111,183,0.05)",
                              hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>",
                            },
                            {
                              type: "scatter", mode: "lines",
                              x: perfResult.dates, y: perfResult.benchmark_values,
                              name: "SPY",
                              line: { color: "#94A3B8", width: 1.5, dash: "dot" },
                              hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>",
                            },
                          ]}
                          layout={chartLayout("€")}
                          height={240}
                          card={false}
                        />
                      </>
                    )}
                    {!perfResult && !perfMutation.isPending && (
                      <EmptyCurve label={
                        !portfolio || !portfolio.tickers.length
                          ? "Select a portfolio or run an optimization in Allocation."
                          : perfMutation.isError
                          ? "Failed to load equity curve. Try refreshing."
                          : "Loading…"
                      } />
                    )}
                  </EquityCurveCard>
                </section>
              )}

              {/* ── Tracker Equity Curve (desktop only) ── */}
              {trackerPortfolios.length > 0 && (
                <section className="mb-5 hidden md:block">
                  <EquityCurveCard
                    title="Tracker Portfolio"
                    badgeLabel={trackerPf ? `${trackerPf.positions.length} positions` : undefined}
                    subtitle={trackerResult ? `${trackerResult.n_days} trading days` : "live positions tracking"}
                    selector={
                      <PortfolioSelect
                        options={trackerPortfolios.map(p => ({ id: p.id, label: p.name }))}
                        value={selectedTrkId ?? ""}
                        onChange={id => { setSelectedTrkId(id); setTrackerResult(null); }}
                      />
                    }
                    onRefresh={() => trackerPf && trackerMutation.mutate(trackerPf)}
                    refreshing={trackerMutation.isPending}
                    accent="#86B38A"
                  >
                    {trackerMutation.isPending && !trackerResult && (
                      <div className="px-5 py-3"><div className="skeleton" style={{ height: 200 }} /></div>
                    )}
                    {trackerResult && (
                      <>
                        <KpiStrip items={[
                          { label: "Current Value",   value: fmtEur(trackerResult.metrics.current_value),   color: "var(--orange)" },
                          { label: "Cost Basis",      value: fmtEur(trackerResult.metrics.cost_basis),       color: "var(--t2)" },
                          { label: "Unrealized P&L",  value: fmtPnl(trackerResult.metrics.unrealized_pnl),   color: trackerResult.metrics.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)" },
                          { label: "Total Return",    value: fmtPct(trackerResult.metrics.total_return),     color: trackerResult.metrics.total_return >= 0 ? "var(--green)" : "var(--red)" },
                          { label: "Max Drawdown",    value: fmtPct(trackerResult.metrics.max_drawdown),     color: "var(--red)" },
                          { label: "Positions",       value: String(trackerPf?.positions.length ?? 0),       color: "var(--t1)" },
                        ]} />
                        <PlotlyChart
                          data={[
                            {
                              type: "scatter", mode: "lines",
                              x: trackerResult.dates, y: trackerResult.portfolio_values,
                              name: trackerPf?.name ?? "Portfolio",
                              line: { color: "#86B38A", width: 2 },
                              fill: "tozeroy",
                              fillcolor: isDark ? "rgba(134,179,138,0.07)" : "rgba(86,147,91,0.05)",
                              hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>",
                            },
                            {
                              type: "scatter", mode: "lines",
                              x: trackerResult.dates, y: trackerResult.cost_basis,
                              name: "Cost basis",
                              line: { color: "#94A3B8", width: 1.5, dash: "dot" },
                              hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>",
                            },
                          ]}
                          layout={chartLayout("€")}
                          height={240}
                          card={false}
                        />

                        {/* Per-position table */}
                        <div className="hidden md:block px-5 pb-4 mt-2 overflow-x-auto">
                          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                {["Ticker", "Shares", "Entry", "Current", "Value", "P&L", "Return"].map(h => (
                                  <th key={h} className="pb-2 text-left font-semibold tracking-widest pr-4"
                                    style={{ color: "var(--t3)", fontSize: 10 }}>{h.toUpperCase()}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {trackerResult.positions.map(pos => {
                                const up = (pos.return_pct ?? 0) >= 0;
                                return (
                                  <tr key={pos.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td className="py-2 pr-4 font-semibold" style={{ color: "var(--orange)" }}>{pos.ticker}</td>
                                    <td className="py-2 pr-4" style={{ color: "var(--t2)" }}>{pos.shares}</td>
                                    <td className="py-2 pr-4" style={{ color: "var(--t3)" }}>€{pos.entry_price.toFixed(2)}</td>
                                    <td className="py-2 pr-4" style={{ color: "var(--t1)" }}>
                                      {pos.current_price != null ? `€${pos.current_price.toFixed(2)}` : "—"}
                                    </td>
                                    <td className="py-2 pr-4" style={{ color: "var(--t1)" }}>
                                      {pos.current_value != null ? fmtEur(pos.current_value) : "—"}
                                    </td>
                                    <td className="py-2 pr-4" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                                      {pos.unrealized_pnl != null ? fmtPnl(pos.unrealized_pnl) : "—"}
                                    </td>
                                    <td className="py-2 font-semibold" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                                      {pos.return_pct != null ? fmtPct(pos.return_pct) : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    {!trackerResult && !trackerMutation.isPending && (
                      <EmptyCurve label={
                        !trackerPf || trackerPf.positions.length === 0
                          ? "Add positions in Portfolio Tracker to see your equity curve."
                          : trackerMutation.isError
                          ? "Failed to load equity curve. Check positions and try refreshing."
                          : "Loading…"
                      } />
                    )}
                  </EquityCurveCard>
                </section>
              )}

              {/* ── Market Pulse ── */}
              <div className="hidden md:block">
                <MarketPulse data={market} loading={marketLoading} updatedAt={marketUpdatedAt} />
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Watchlist + Community feed (desktop only) ── */}
        {watchlist.length > 0 && (
          <div className="hidden lg:block w-full lg:w-[320px] lg:flex-shrink-0">
            <WatchlistPanel tickers={watchlist} />
            <CommunityFeedWidget limit={5} />
          </div>
        )}
      </div>

      {/* ── Bottom 2-col: News feed + Optimizer Portfolio Summary (mobile shows portfolio summary first then news) ── */}
      <div className={`grid grid-cols-1 gap-5 mb-5${portfolio ? " lg:grid-cols-2" : ""}`}>
        <NewsPanel />

        {portfolio && (
          <section className="card" style={{ borderRadius: "var(--r-2xl)", padding: "18px 20px" }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="badge badge-orange">{portfolio.method ?? "—"}</span>
                <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{portfolio.name}</span>
              </div>
              <Link href="/portfolio" className="btn-secondary" style={{ borderRadius: "var(--r)", flexShrink: 0 }}>
                Open <ArrowRight size={12} />
              </Link>
            </div>

            <div style={{ color: "var(--t3)", fontSize: "0.62rem", marginBottom: 12 }}>
              {portfolio.tickers.length} assets · {fmtEur(portfolio.capital)} · saved {new Date(portfolio.savedAt).toLocaleDateString()}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <StatTile label="Ann. Return"  value={fmtPct(perfResult?.metrics?.ann_return)}       icon={<TrendingUp size={13} />}  tone={(perfResult?.metrics?.ann_return ?? 0) >= 0 ? "up" : "down"} />
              <StatTile label="Volatility"   value={fmtPct(perfResult?.metrics?.ann_volatility)}    icon={<Activity size={13} />} />
              <StatTile label="Sharpe"       value={fmtNum(perfResult?.metrics?.sharpe_ratio)}      icon={<Target size={13} />}      tone={(perfResult?.metrics?.sharpe_ratio ?? 0) >= 1 ? "up" : undefined} />
              <StatTile label="Max DD"       value={fmtPct(perfResult?.metrics?.max_drawdown)}      icon={<TrendingDown size={13} />} tone="down" />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={12} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--t2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Allocation
              </span>
            </div>
            <div className="space-y-1">
              {Object.entries(weights)
                .sort((a, b) => b[1] - a[1])
                .map(([tkr, w], i) => (
                  <AllocationRow key={tkr} ticker={tkr} weight={w}
                    capitalEur={portfolio.capital * w}
                    color={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
            </div>

            {upcoming.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-4 mb-2">
                  <CalendarClock size={12} style={{ color: "var(--orange)" }} />
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--t2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Upcoming Events
                  </span>
                </div>
                <div className="space-y-1">
                  {upcoming.slice(0, 6).map((ev, idx) => (
                    <EventRow key={`${ev.ticker}-${ev.type}-${idx}`} event={ev} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="hidden md:flex items-center gap-3" style={{ color: "var(--t3)", fontSize: "0.72rem" }}>
        <span>{optPortfolios.length} optimizer portfolio{optPortfolios.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{trackerPortfolios.length} tracker portfolio{trackerPortfolios.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <Link href="/screener" style={{ color: "var(--orange)" }}>Find new ideas →</Link>
        <span>·</span>
        <Link href="/scorer" style={{ color: "var(--orange)" }}>Score conviction →</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------
function EquityCurveCard({
  title, badgeLabel, subtitle, selector, onRefresh, refreshing, accent = "#7AA7E8",
  timeRange, onTimeRangeChange, children,
}: {
  title: string; badgeLabel?: string; subtitle?: string;
  selector: React.ReactNode; onRefresh: () => void; refreshing: boolean;
  accent?: string; timeRange?: TimeRange; onTimeRangeChange?: (r: TimeRange) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <LineChart size={14} style={{ color: accent }} />
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--t1)" }}>{title}</span>
          {badgeLabel && (
            <span className="px-2 py-0.5 rounded text-xs font-semibold"
              style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
              {badgeLabel}
            </span>
          )}
          {selector}
        </div>
        <div className="flex items-center gap-3">
          {subtitle && <span style={{ color: "var(--t3)", fontSize: "0.68rem" }}>{subtitle}</span>}
          {timeRange !== undefined && onTimeRangeChange && (
            <div className="flex items-center gap-1">
              {(["6mo", "1y", "3y", "5y", "10y"] as TimeRange[]).map(r => (
                <button key={r} onClick={() => onTimeRangeChange(r)}
                  className="px-2 py-0.5 rounded text-xs border transition-all"
                  style={{
                    background: timeRange === r ? "var(--orange-dim)" : "var(--bg-hover)",
                    borderColor: timeRange === r ? "var(--orange-border)" : "var(--border)",
                    color: timeRange === r ? "var(--orange)" : "var(--t3)",
                  }}>
                  {r}
                </button>
              ))}
            </div>
          )}
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--t3)", background: "var(--bg-hover)" }}>
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function PortfolioSelect({ options, value, onChange }: {
  options: { id: string; label: string }[]; value: string; onChange: (id: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none text-xs px-2.5 py-1 pr-6 rounded border cursor-pointer outline-none"
        style={{
          background: "var(--bg-hover)", borderColor: "var(--border)",
          color: "var(--t1)", fontSize: "0.72rem",
        }}
      >
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown size={10} className="absolute right-1.5 pointer-events-none" style={{ color: "var(--t3)" }} />
    </div>
  );
}

function KpiStrip({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div style={{ overflowX: "auto", borderBottom: "1px solid var(--border)" }}>
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${items.length}, minmax(100px, 1fr))`,
      minWidth: "max-content",
      width: "100%",
    }}>
      {items.map((m, i) => (
        <div key={m.label} className="px-4 py-3" style={{
          background: "var(--bg-card)",
          borderRight: i < items.length - 1 ? "1px solid var(--border)" : "none",
        }}>
          <p style={{ fontSize: "0.62rem", color: "var(--t3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
            {m.label}
          </p>
          <p className="mono" style={{ fontSize: "1.05rem", fontWeight: 600, color: m.color, lineHeight: 1 }}>
            {m.value}
          </p>
        </div>
      ))}
    </div>
    </div>
  );
}

type PortfolioMetrics = Partial<Record<"total_return" | "ann_return" | "ann_volatility" | "sharpe_ratio" | "max_drawdown" | "current_value" | "cost_basis" | "unrealized_pnl", number>>;

function MobilePortfolioKpis({
  className, optimizer, tracker, onRefreshOpt, onRefreshTrk, loadingOpt, loadingTrk,
}: {
  className?: string;
  optimizer: { name: string; metrics: PortfolioMetrics | null } | null;
  tracker: { name: string; metrics: PortfolioMetrics | null; positions: number } | null;
  onRefreshOpt: () => void;
  onRefreshTrk: () => void;
  loadingOpt: boolean;
  loadingTrk: boolean;
}) {
  const rows: Array<{ label: string; value: string; tone?: "up" | "down" | "neutral" }> = [];
  if (optimizer) {
    const m = optimizer.metrics;
    rows.push({ label: "Optimizer", value: optimizer.name, tone: "neutral" });
    rows.push({ label: "Value",   value: fmtEur(m?.current_value),   tone: "neutral" });
    rows.push({ label: "Return",  value: fmtPct(m?.total_return),    tone: (m?.total_return ?? 0) >= 0 ? "up" : "down" });
    rows.push({ label: "Sharpe",  value: fmtNum(m?.sharpe_ratio, 2), tone: "neutral" });
    rows.push({ label: "Max DD",  value: fmtPct(m?.max_drawdown),    tone: "down" });
  }
  if (tracker) {
    const m = tracker.metrics;
    rows.push({ label: "Tracker", value: `${tracker.name} · ${tracker.positions}p`, tone: "neutral" });
    rows.push({ label: "Value",   value: fmtEur(m?.current_value),    tone: "neutral" });
    rows.push({ label: "P&L",     value: fmtPnl(m?.unrealized_pnl),   tone: (m?.unrealized_pnl ?? 0) >= 0 ? "up" : "down" });
    rows.push({ label: "Return",  value: fmtPct(m?.total_return),     tone: (m?.total_return ?? 0) >= 0 ? "up" : "down" });
  }
  if (rows.length === 0) return null;

  return (
    <section className={cn("card", className)} style={{ padding: "12px 14px" }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>
          Portfolios
        </span>
        <div className="flex items-center gap-2">
          {optimizer && (
            <button onClick={onRefreshOpt} disabled={loadingOpt}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "3px 8px", fontSize: 10, color: "var(--t3)" }}>
              {loadingOpt ? "…" : "↻ opt"}
            </button>
          )}
          {tracker && (
            <button onClick={onRefreshTrk} disabled={loadingTrk}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "3px 8px", fontSize: 10, color: "var(--t3)" }}>
              {loadingTrk ? "…" : "↻ trk"}
            </button>
          )}
        </div>
      </div>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", fontSize: 11, color: "var(--t3)", letterSpacing: "0.04em", textTransform: "uppercase", width: "40%" }}>
                {r.label}
              </td>
              <td className="mono" style={{
                padding: "7px 0", fontSize: 12, fontWeight: 600, textAlign: "right",
                color: r.tone === "up" ? "var(--green)" : r.tone === "down" ? "var(--red)" : "var(--t1)",
              }}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EmptyCurve({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-32" style={{ color: "var(--t3)", fontSize: "0.78rem" }}>
      {label}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="card flex flex-col items-center justify-center text-center"
      style={{ borderRadius: "var(--r-2xl)", padding: "64px 32px", minHeight: 420 }}>
      <div style={{
        width: 52, height: 52, background: "var(--orange-dim)",
        border: "1px solid var(--orange-border)", borderRadius: "var(--r)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
      }}>
        <Briefcase size={22} style={{ color: "var(--orange)" }} />
      </div>
      <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--t1)", marginBottom: 6 }}>No portfolio yet</h2>
      <p style={{ color: "var(--t2)", fontSize: "0.85rem", maxWidth: 400, marginBottom: 18 }}>
        Screen ideas, score conviction, then run the optimizer or add positions in Tracker.
      </p>
      <div className="flex gap-2">
        <Link href="/screener" className="btn-primary" style={{ borderRadius: "var(--r)" }}>Find ideas</Link>
        <Link href="/portfolio" className="btn-secondary" style={{ borderRadius: "var(--r)" }}>Optimize</Link>
        <Link href="/tracker" className="btn-secondary" style={{ borderRadius: "var(--r)" }}>Track positions</Link>
      </div>
    </section>
  );
}

function StatTile({ label, value, icon, tone }: {
  label: string; value: string; icon: React.ReactNode; tone?: "up" | "down";
}) {
  const color = tone === "up" ? "var(--green)" : tone === "down" ? "var(--red)" : "var(--t1)";
  return (
    <div style={{
      background: "var(--bg-inner)", border: "1px solid var(--border)",
      borderTopColor: "var(--border-hi)", borderRadius: "var(--r)", padding: "12px 16px",
    }}>
      <div className="flex items-center gap-1.5" style={{
        color: "var(--t2)", fontSize: "0.62rem", fontWeight: 600,
        letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8,
      }}>
        <span style={{ color: "var(--orange)" }}>{icon}</span>
        {label}
      </div>
      <div className="mono" style={{ fontSize: "1.25rem", fontWeight: 600, color, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function AllocationRow({ ticker, weight, capitalEur, color }: {
  ticker: string; weight: number; capitalEur: number; color: string;
}) {
  return (
    <div className="flex items-center gap-3" style={{ padding: "6px 0" }}>
      <div className="mono" style={{ minWidth: 72, color: "var(--orange)", fontWeight: 600, fontSize: "0.8rem" }}>{ticker}</div>
      <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(2, weight * 100)}%`, background: color, borderRadius: 999 }} />
      </div>
      <div className="mono" style={{ minWidth: 52, textAlign: "right", color: "var(--t1)", fontSize: "0.78rem", fontWeight: 500 }}>
        {(weight * 100).toFixed(1)}%
      </div>
      <div className="mono" style={{ minWidth: 76, textAlign: "right", color: "var(--t2)", fontSize: "0.72rem" }}>
        {fmtEur(capitalEur)}
      </div>
    </div>
  );
}

function MarketPulse({ data, loading, updatedAt }: { data: MarketOverview | undefined; loading: boolean; updatedAt?: number }) {
  if (loading) {
    return <section className="card mb-5" style={{ padding: 20 }}><div className="skeleton" style={{ height: 140 }} /></section>;
  }
  if (!data) return null;
  const { indices, stress } = data;
  const regimeTone =
    stress.regime === "Calm"     ? "var(--green)"  :
    stress.regime === "Normal"   ? "var(--orange)" :
    stress.regime === "Elevated" ? "var(--yellow)" : "var(--red)";
  const minsAgo = updatedAt ? Math.round((Date.now() - updatedAt) / 60_000) : null;

  return (
    <section className="mb-5">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="card" style={{ padding: "20px 22px" }}>
          <div className="flex items-center gap-2 mb-3">
            <Gauge size={14} style={{ color: "var(--orange)" }} />
            <span style={{ fontSize: "0.66rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>Market Stress</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="mono" style={{ fontSize: "2.2rem", fontWeight: 600, color: regimeTone, lineHeight: 1 }}>
              {stress.score.toFixed(0)}
            </span>
            <span style={{ color: "var(--t3)", fontSize: "0.72rem" }}>/ 100</span>
          </div>
          <div style={{ height: 6, background: "rgba(127,127,127,0.14)", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
            <div style={{ height: "100%", width: `${Math.min(100, stress.score)}%`, background: regimeTone, borderRadius: 999 }} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="badge" style={{ background: "var(--bg-hover)", color: regimeTone, border: `1px solid ${regimeTone}` }}>
              {stress.regime}
            </span>
            <span style={{ color: "var(--t3)", fontSize: "0.65rem" }}>VIX · DD · Vol · Rates</span>
          </div>
        </div>

        <div className="card lg:col-span-3" style={{ padding: "16px 20px" }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Globe size={14} style={{ color: "var(--orange)" }} />
              <span style={{ fontSize: "0.66rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>Global Markets</span>
            </div>
            {minsAgo !== null && (
              <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>
                {minsAgo === 0 ? "Updated just now" : `Updated ${minsAgo}m ago`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {indices.map(i => <IndexCell key={i.symbol} idx={i} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function IndexCell({ idx }: { idx: MarketIndex }) {
  const up = idx.change_1d_pct >= 0;
  return (
    <div style={{ padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg-inner)" }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: "0.68rem", color: "var(--t2)", fontWeight: 600 }}>{idx.label}</span>
        <span style={{ fontSize: "0.66rem", fontWeight: 600, color: up ? "var(--green)" : "var(--red)" }}>
          {up ? "▲" : "▼"} {Math.abs(idx.change_1d_pct).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-end justify-between mt-1">
        <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--t1)" }}>
          {idx.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        <Sparkline values={idx.spark} up={up} />
      </div>
    </div>
  );
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (!values?.length) return null;
  const w = 64, h = 18;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ opacity: 0.8 }}>
      <polyline fill="none" strokeWidth="1.2" stroke={up ? "var(--green)" : "var(--red)"} points={pts} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// News helpers
// ---------------------------------------------------------------------------
interface NewsItem {
  title: string; publisher: string; link: string;
  published: number; tickers: string[]; thumbnail: string;
}

function newsTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000 - ts));
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// News Panel
// ---------------------------------------------------------------------------
function NewsPanel() {
  const { data, isLoading } = useQuery<{ news: NewsItem[] }>({
    queryKey: ["market-news"],
    queryFn:  () => get<{ news: NewsItem[] }>("/market/news"),
    staleTime: 10 * 60_000,
  });

  const news = data?.news ?? [];

  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)", boxShadow: "var(--card-shadow)" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <Newspaper size={13} style={{ color: "var(--orange)" }} />
        <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
          Market News
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.6rem", color: "var(--t3)" }}>Live · yfinance</span>
      </div>

      {/* Items */}
      {isLoading ? (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div className="skeleton" style={{ width: 64, height: 48, flexShrink: 0, borderRadius: "var(--r-sm)" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="skeleton" style={{ height: 10, width: "90%" }} />
                <div className="skeleton" style={{ height: 10, width: "65%" }} />
                <div className="skeleton" style={{ height: 8, width: "40%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--t3)", fontSize: "0.8rem" }}>
          No news available.
        </div>
      ) : (
        <div>
          {news.slice(0, 8).map((item, i) => {
            const isLast = i === Math.min(7, news.length - 1);
            return (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", display: "block" }}
              >
                <div
                  style={{
                    display: "flex", gap: 12, padding: "12px 16px",
                    borderBottom: isLast ? "none" : "1px solid var(--border)",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Thumbnail */}
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt=""
                      style={{ width: 68, height: 52, objectFit: "cover", borderRadius: "var(--r-sm)", flexShrink: 0, background: "var(--bg-hover)" }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div style={{ width: 68, height: 52, flexShrink: 0, borderRadius: "var(--r-sm)", background: "var(--bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Newspaper size={18} style={{ color: "var(--t3)" }} />
                    </div>
                  )}

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Meta row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--orange)", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: "var(--r-xs)", padding: "1px 5px" }}>
                        {item.publisher || "News"}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "0.58rem", color: "var(--t3)" }}>
                        <Clock size={9} />
                        {newsTimeAgo(item.published)}
                      </span>
                      {item.tickers?.slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: "0.56rem", fontWeight: 700, color: "var(--t3)", padding: "1px 4px", border: "1px solid var(--border)", borderRadius: "var(--r-xs)" }}>
                          {t}
                        </span>
                      ))}
                      <ExternalLink size={9} style={{ color: "var(--t3)", marginLeft: "auto", flexShrink: 0 }} />
                    </div>

                    {/* Title */}
                    <p style={{
                      fontSize: "0.77rem", fontWeight: 500, color: "var(--t1)", lineHeight: 1.4,
                      overflow: "hidden", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>
                      {item.title}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watchlist Panel
// ---------------------------------------------------------------------------
function WatchlistPanel({ tickers }: { tickers: string[] }) {
  const { toggleWatchlist } = useWatchlist();
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 10;
  const visibleTickers = expanded ? tickers : tickers.slice(0, MAX_VISIBLE);
  const hasMore = tickers.length > MAX_VISIBLE;

  const queries = useQueries({
    queries: tickers.map(ticker => ({
      queryKey: ["fund", ticker],
      queryFn: () => get<EquityFundamentals>(`/equity/${ticker}/fundamentals`),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  return (
    <section style={{ marginBottom: 20 }}>
      <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)", boxShadow: "var(--card-shadow)" }}>

        {/* Header */}
        <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Wallet size={12} style={{ color: "var(--orange)" }} />
            <span style={{ fontSize: "0.67rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
              Watchlist
            </span>
            <span style={{
              fontSize: "0.58rem", fontWeight: 700,
              padding: "1px 6px", borderRadius: 3,
              background: "var(--orange-dim)", border: "1px solid var(--orange-border)", color: "var(--orange)",
            }}>
              {tickers.length}
            </span>
          </div>
          <Link href="/screener" style={{ fontSize: "0.6rem", color: "var(--orange)", textDecoration: "none" }}>
            + Add
          </Link>
        </div>

        {/* Col headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(52px,68px) minmax(0,1fr) 76px 68px 22px",
          padding: "5px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.56rem", fontWeight: 600, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--t3)", gap: 4,
        }}>
          <span>Ticker</span>
          <span>Name</span>
          <span style={{ textAlign: "right" }}>Price</span>
          <span style={{ textAlign: "right" }}>Chg%</span>
          <span />
        </div>

        {/* Rows */}
        <div style={{ overflowX: "auto" }}>
          {visibleTickers.map((ticker, i) => {
            const originalIdx = tickers.indexOf(ticker);
            const q = queries[originalIdx];
            const data = q.data;
            const price = data?.currentPrice;
            const prevClose = data?.previousClose;
            const changeAbs = price != null && prevClose != null ? price - prevClose : null;
            const changePct = changeAbs != null && prevClose ? changeAbs / prevClose : null;
            const up = changePct !== null ? changePct >= 0 : null;
            const isLast = i === visibleTickers.length - 1 && !hasMore;

            return (
              <div
                key={ticker}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(52px,68px) minmax(0,1fr) 76px 68px 22px",
                  padding: "8px 12px",
                  alignItems: "center",
                  borderBottom: isLast ? "none" : "1px solid var(--border)",
                  transition: "background 0.1s",
                  gap: 4,
                  minWidth: 280,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Ticker */}
                <Link href={`/equity?ticker=${encodeURIComponent(ticker)}`} style={{ textDecoration: "none" }}>
                  <span className="mono" style={{ fontWeight: 700, color: "var(--orange)", fontSize: "0.82rem", display: "block", lineHeight: 1.2 }}>
                    {ticker}
                  </span>
                </Link>

                {/* Name */}
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  {q.isLoading ? (
                    <div className="skeleton" style={{ height: 10, width: "70%" }} />
                  ) : (
                    <span style={{ fontSize: "0.66rem", color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                      {data?.longName ?? data?.sector ?? "—"}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div style={{ textAlign: "right" }}>
                  {q.isLoading ? (
                    <div className="skeleton" style={{ height: 13, width: 48, marginLeft: "auto" }} />
                  ) : price != null ? (
                    <span className="mono" style={{ fontWeight: 600, color: "var(--t1)", fontSize: "0.84rem" }}>
                      {price >= 10000
                        ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : price.toFixed(2)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--t3)", fontSize: "0.72rem" }}>—</span>
                  )}
                </div>

                {/* Change% */}
                <div style={{ textAlign: "right" }}>
                  {q.isLoading ? (
                    <div className="skeleton" style={{ height: 13, width: 42, marginLeft: "auto" }} />
                  ) : changePct !== null ? (
                    <span className="mono" style={{ fontWeight: 600, fontSize: "0.76rem", color: up ? "var(--green)" : "var(--red)" }}>
                      {up ? "+" : ""}{(changePct * 100).toFixed(2)}%
                    </span>
                  ) : (
                    <span style={{ color: "var(--t3)", fontSize: "0.72rem" }}>—</span>
                  )}
                </div>

                {/* Remove */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => toggleWatchlist(ticker)}
                    title="Remove"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex", alignItems: "center", opacity: 0.28, transition: "opacity 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.28")}
                  >
                    <Heart size={10} fill="var(--red)" stroke="var(--red)" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Voir plus / Voir moins */}
        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              width: "100%", padding: "8px", borderTop: "1px solid var(--border)",
              background: "none", border: "none", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 5,
              fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.05em",
              color: "var(--orange)", transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {expanded ? <><ChevronUp size={12} /> Voir moins</> : <><ChevronDown size={12} /> Voir plus ({tickers.length - MAX_VISIBLE})</>}
          </button>
        )}
      </div>
    </section>
  );
}

function EventRow({ event }: { event: { ticker: string; type: "Earnings" | "Dividend"; date: string; extra?: string } }) {
  const d = daysUntil(event.date);
  const soon = d !== null && d <= 14;
  const Icon = event.type === "Earnings" ? TrendingUp : Coins;
  return (
    <div className="flex items-center gap-2.5" style={{
      padding: "7px 10px", borderRadius: "var(--r-sm)",
      background: soon ? "var(--orange-dim)" : "transparent",
      border: soon ? "1px solid var(--orange-border)" : "1px solid transparent",
    }}>
      <Icon size={12} style={{ color: "var(--orange)", flexShrink: 0 }} />
      <div className="mono" style={{ color: "var(--orange)", fontWeight: 600, fontSize: "0.75rem", minWidth: 56 }}>{event.ticker}</div>
      <div style={{ flex: 1, color: "var(--t2)", fontSize: "0.7rem" }}>{event.type}{event.extra ? ` · ${event.extra}` : ""}</div>
      <div className="mono" style={{ color: "var(--t1)", fontSize: "0.7rem" }}>{event.date}</div>
      {d !== null && (
        <div className="mono" style={{ color: soon ? "var(--orange)" : "var(--t3)", fontSize: "0.66rem", minWidth: 40, textAlign: "right" }}>
          {d === 0 ? "today" : d < 0 ? `${-d}d ago` : `in ${d}d`}
        </div>
      )}
    </div>
  );
}
