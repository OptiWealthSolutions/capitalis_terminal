"use client";

import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import type {
  PriceHistory, EquityFundamentals, ReturnsStats,
  EquityFinancials, FinancialPeriod,
} from "@/lib/types";
import TVChart from "@/components/charts/TVChart";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonBlock, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  formatNumber, formatPercent, formatCurrency, formatLargeNumber,
} from "@/lib/utils";
import { Search, TrendingUp, BarChart2, LineChart, Users, ArrowLeftRight, Plus, X as XIcon, Heart } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useInvestorMode } from "@/lib/investorMode";
import { Bell, Shield, TrendingDown } from "lucide-react";
import MetricTooltip, { ToneDot, getMetricTone, METRIC_TIPS, type MetricTone } from "@/components/ui/MetricTooltip";
import { useWatchlist } from "@/lib/watchlist";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
type Period = typeof PERIODS[number];
type FinView = "annual" | "quarterly";
type Tab = "overview" | "financials" | "charts" | "ownership" | "comparison";

/* ─── interfaces ─── */
interface HolderRow {
  Holder?: string; pctHeld?: number; Shares?: number; Value?: number; "Date Reported"?: string;
  [key: string]: unknown;
}
interface InsiderTx {
  "Start Date"?: string; Insider?: string; Position?: string;
  Transaction?: string; Shares?: number; Value?: number;
}
interface InsiderRoster {
  Name?: string; Position?: string;
  "Most Recent Transaction"?: string; "Latest Transaction Date"?: string;
  "Shares Owned Directly"?: number;
}
interface HoldersData {
  ticker: string;
  major_summary: { label: string; value: string }[] | null;
  institutional: HolderRow[];
  mutualfunds: HolderRow[];
  insider_transactions: InsiderTx[];
  insider_roster: InsiderRoster[];
}
interface HolderColDef {
  key: string; label: string; num?: boolean; fmt?: (v: unknown) => string;
}

/* ─── helpers ─── */
function fmtBig(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtBNull(v: number | null): string {
  if (v == null) return "N/A";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  return v.toFixed(2);
}

/* ════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════ */
export default function EquityPage() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { mode } = useInvestorMode();
  const { isWatched, toggleWatchlist } = useWatchlist();
  const isSimple = mode === "simple";
  const isDark = theme === "dark";
  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: "overview",    label: t.equity.tabs.overview,    Icon: TrendingUp      },
    { id: "financials",  label: t.equity.tabs.financials,  Icon: BarChart2       },
    { id: "charts",      label: t.equity.tabs.charts,      Icon: LineChart       },
    { id: "ownership",   label: t.equity.tabs.ownership,   Icon: Users           },
    { id: "comparison",  label: "Comparison",              Icon: ArrowLeftRight  },
  ];
  const [peerTickers, setPeerTickers] = useState<string[]>([]);
  const [peerInput, setPeerInput]     = useState("");

  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState(() => {
    const t = searchParams?.get("ticker");
    return t ? t.toUpperCase() : "NVDA";
  });
  const [inputValue, setInputValue] = useState(() => {
    const t = searchParams?.get("ticker");
    return t ? t.toUpperCase() : "NVDA";
  });
  const [suggestions, setSuggestions] = useState<{ticker: string; name: string; exchange: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [period, setPeriod] = useState<Period>("1y");
  const [finView, setFinView] = useState<FinView>("annual");
  const [tab, setTab] = useState<Tab>("overview");

  const history = useQuery<PriceHistory>({
    queryKey: ["equity-history", ticker, period],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/history?period=${period}`),
    enabled: !!ticker, staleTime: 3_600_000,
  });
  const fundamentals = useQuery<EquityFundamentals>({
    queryKey: ["equity-fundamentals", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/fundamentals`),
    enabled: !!ticker, staleTime: 3_600_000,
  });
  const stats = useQuery<ReturnsStats>({
    queryKey: ["equity-stats", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/returns-stats`),
    enabled: !!ticker, staleTime: 3_600_000,
  });
  const financials = useQuery<EquityFinancials>({
    queryKey: ["equity-financials", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/financials`),
    enabled: !!ticker, staleTime: 86_400_000,
  });
  const holders = useQuery<HoldersData>({
    queryKey: ["equity-holders", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/holders`),
    enabled: !!ticker, staleTime: 6 * 3_600_000,
  });

  const handleSearch = () => {
    const val = inputValue.trim().toUpperCase();
    if (val) { setTicker(val); setTab("overview"); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await get<{results: {ticker: string; name: string; exchange: string}[]}>(`/equity/search?q=${encodeURIComponent(val)}`);
        setSuggestions(data.results || []);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
      finally { setSearchLoading(false); }
    }, 350);
  };

  const fund = fundamentals.data;
  const s = stats.data;
  const n = (v: unknown) => v as number | undefined;
  const currentPrice  = fund?.currentPrice as number | undefined;
  const prevClose     = fund?.previousClose as number | undefined;
  const dayChange     = currentPrice != null && prevClose != null ? currentPrice - prevClose : null;
  const dayChangePct  = dayChange != null && prevClose ? dayChange / prevClose : null;
  const isError       = history.isError || fundamentals.isError;

  return (
    <ErrorBoundary>
      <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.06em", color: "var(--t3)", marginBottom: 4, textTransform: "uppercase" }}>Deep dive</p>
            <h1 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>{t.equity.title}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Watchlist heart button */}
          <button
            onClick={() => toggleWatchlist(ticker)}
            title={isWatched(ticker) ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: "var(--r-sm)",
              border: "1px solid var(--card-border)", background: "var(--bg-hover)",
              cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; }}
          >
            <Heart
              size={14}
              fill={isWatched(ticker) ? "var(--red)" : "none"}
              stroke={isWatched(ticker) ? "var(--red)" : "var(--t3)"}
            />
          </button>
          <div style={{ position: "relative" }}>
            <div style={{
              display: "flex", border: "1px solid var(--card-border)",
              borderRadius: "var(--r-sm)", overflow: "visible",
            }}>
              <input
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={(e) => { if (e.key === "Enter") { handleSearch(); setShowSuggestions(false); } if (e.key === "Escape") setShowSuggestions(false); }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Ticker or company name…"
                style={{
                  background: "var(--bg-base)", border: "none", outline: "none",
                  color: "var(--t1)", fontSize: "0.82rem", padding: "8px 14px",
                  fontFamily: "inherit", fontWeight: 500,
                  width: 220, borderRadius: "var(--r-sm) 0 0 var(--r-sm)",
                }}
              />
              <button
                onClick={() => { handleSearch(); setShowSuggestions(false); }}
                style={{
                  background: "var(--orange)", border: "none", cursor: "pointer",
                  padding: "0 14px", display: "flex", alignItems: "center",
                  transition: "filter 0.15s", borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.filter = "brightness(1.1)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.filter = "")}
              >
                {searchLoading ? <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /> : <Search size={13} color="#fff" />}
              </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: "var(--bg-card)", border: "1px solid var(--card-border)",
                borderRadius: "var(--r-sm)", marginTop: 4, zIndex: 50,
                maxHeight: 280, overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              }}>
                {suggestions.map((s) => (
                  <button
                    key={s.ticker}
                    onMouseDown={() => {
                      setInputValue(s.ticker);
                      setTicker(s.ticker);
                      setTab("overview");
                      setShowSuggestions(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "8px 14px", background: "none",
                      border: "none", cursor: "pointer", textAlign: "left",
                      borderBottom: "1px solid var(--card-border)",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
                  >
                    <span style={{ fontWeight: 700, color: "var(--orange)", fontSize: "0.78rem", minWidth: 60 }}>{s.ticker}</span>
                    <span style={{ color: "var(--t2)", fontSize: "0.75rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ color: "var(--t3)", fontSize: "0.65rem", flexShrink: 0 }}>{s.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {isError && (
          <QueryError
            error={(history.error ?? fundamentals.error) as Error}
            onRetry={() => { history.refetch(); fundamentals.refetch(); stats.refetch(); }}
          />
        )}

        {/* ── Ticker band (always visible) ── */}
        {fundamentals.isLoading ? (
          <div style={{ marginBottom: 16 }}><SkeletonBlock className="h-24" /></div>
        ) : fund ? (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--card-border)",
            borderRadius: "var(--r-xl)", overflow: "hidden", marginBottom: 4,
          }}>
            {/* Identity + price row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.5rem", fontWeight: 800, color: "var(--orange)", letterSpacing: "-0.01em", flexShrink: 0 }}>
                  {ticker}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String(fund.longName ?? "")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {fund.sector && <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.05em", padding: "2px 8px", borderRadius: "9999px", background: "var(--orange-dim)", color: "var(--orange)", border: "1px solid var(--orange-border)" }}>{String(fund.sector)}</span>}
                    {fund.industry && <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{String(fund.industry)}</span>}
                    {!!fund.exchange && <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>· {String(fund.exchange)}</span>}
                  </div>
                </div>
              </div>
              {currentPrice != null && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.9rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(currentPrice, (fund.currency as string) ?? "USD")}
                  </span>
                  {dayChange !== null && dayChangePct !== null && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color: dayChange >= 0 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums" }}>
                        {dayChange >= 0 ? "+" : ""}{formatNumber(dayChange, 2)}
                      </span>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: dayChange >= 0 ? "var(--green)" : "var(--red)", opacity: 0.8 }}>
                        {dayChangePct >= 0 ? "+" : ""}{formatPercent(dayChangePct)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Metrics strip */}
            {(() => {
              const low52 = n(fund?.fiftyTwoWeekLow);
              const high52 = n(fund?.fiftyTwoWeekHigh);
              const cur = currentPrice;
              const range52 = (high52 ?? 0) - (low52 ?? 0);
              const pos52 = range52 > 0 && cur != null ? Math.max(0, Math.min(1, (cur - (low52 ?? 0)) / range52)) : null;
              const strip = [
                { label: "Market Cap",  value: fund?.marketCap      != null ? formatLargeNumber(n(fund.marketCap))      : "—" },
                { label: "Volume",      value: fund?.volume         != null ? formatLargeNumber(n(fund.volume))         : "—" },
                { label: "Avg Vol",     value: fund?.averageVolume  != null ? formatLargeNumber(n(fund.averageVolume))  : "—" },
                { label: "Fwd P/E",     value: fund?.forwardPE      != null ? formatNumber(n(fund.forwardPE), 1)        : "—" },
                { label: "Beta",        value: fund?.beta           != null ? formatNumber(n(fund.beta), 2)             : "—" },
              ];
              return (
                <div style={{ borderTop: "1px solid var(--card-border)", padding: "10px 22px", display: "flex", alignItems: "center", gap: 0, background: "var(--bg-inner)", flexWrap: "wrap", rowGap: 8 }}>
                  {strip.map((m) => (
                    <div key={m.label} style={{ display: "flex", flexDirection: "column", paddingRight: 28 }}>
                      <span style={{ fontSize: "0.56rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>{m.label}</span>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{m.value}</span>
                    </div>
                  ))}
                  {low52 != null && high52 != null && pos52 != null && (
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 140, maxWidth: 240 }}>
                      <span style={{ fontSize: "0.56rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 5 }}>52W Range</span>
                      <div style={{ position: "relative", height: 3, background: "var(--card-border)", borderRadius: 2 }}>
                        <div style={{ position: "absolute", left: 0, top: 0, width: `${pos52 * 100}%`, height: "100%", background: "var(--orange)", borderRadius: 2 }} />
                        <div style={{ position: "absolute", top: -4, left: `calc(${pos52 * 100}% - 5px)`, width: 11, height: 11, borderRadius: "50%", background: "var(--orange)", border: "2px solid var(--bg-inner)" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: "0.56rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(low52, (fund.currency as string) ?? "USD")}</span>
                        <span style={{ fontSize: "0.56rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(high52, (fund.currency as string) ?? "USD")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── SIMPLE MODE: focused summary ─────────────────────────── */}
        {isSimple && fund && (
          <EquitySimpleView
            ticker={ticker}
            fund={fund}
            stats={s ?? null}
            history={history.data ?? null}
            currentPrice={currentPrice}
            dayChange={dayChange}
            dayChangePct={dayChangePct}
          />
        )}

        {/* ── Tab bar (advanced mode only) ── */}
        {!isSimple && (
          <div style={{ display: "flex", borderBottom: "1px solid var(--card-border)", marginBottom: 24, marginTop: 4, overflowX: "auto" }}>
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 20px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? "var(--orange)" : "transparent"}`, marginBottom: -1, cursor: "pointer", color: tab === id ? "var(--orange)" : "var(--t2)", fontSize: "0.8rem", fontWeight: tab === id ? 600 : 400, letterSpacing: "0.01em", transition: "all 0.12s" }}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
        )}

        {/* ════ Tab: Overview ════ */}
        {!isSimple && tab === "overview" && (() => {
          const ann = financials.data?.annual;
          const lastIdx = ann && ann.dates.length > 0 ? ann.dates.length - 1 : -1;
          const prevIdx = lastIdx > 0 ? lastIdx - 1 : -1;
          const recMean = n(fund?.recommendationMean);
          const recLabel = recMean == null ? null : recMean <= 1.5 ? "STRONG BUY" : recMean <= 2.5 ? "BUY" : recMean <= 3.5 ? "HOLD" : recMean <= 4.5 ? "UNDERPERFORM" : "SELL";
          const recColor = recMean == null ? "var(--t3)" : recMean <= 2.5 ? "var(--green)" : recMean <= 3.5 ? "var(--orange)" : "var(--red)";
          const recBarPct = recMean != null ? Math.max(0, Math.min(100, ((5 - recMean) / 4) * 100)) : 0;
          const insiders = holders.data?.insider_transactions?.slice(0, 4) ?? [];
          const OV_PERIODS: { label: string; value: Period }[] = [
            { label: "1M", value: "1mo" }, { label: "3M", value: "3mo" },
            { label: "6M", value: "6mo" }, { label: "1Y", value: "1y"  },
            { label: "2Y", value: "2y"  }, { label: "5Y", value: "5y"  },
          ];
          function fmtGrowth(cur: number | null, prev: number | null): number | null {
            if (cur == null || prev == null) return null;
            // Sign change (neg → pos or pos → neg): meaningful but uncappable, return null (N/M)
            if (prev === 0 || (prev < 0 && cur > 0) || (prev > 0 && cur < 0)) return null;
            const g = ((cur - prev) / Math.abs(prev)) * 100;
            // Cap at ±999% — beyond that, figure is misleading
            if (!isFinite(g) || Math.abs(g) > 999) return null;
            return g;
          }
          const incomeRows = lastIdx >= 0 && ann ? [
            { label: "Total Revenue",    cur: ann.revenue[lastIdx],          prev: ann.revenue[prevIdx]          },
            { label: "Gross Profit",     cur: ann.gross_profit[lastIdx],     prev: ann.gross_profit[prevIdx]     },
            { label: "Operating Income", cur: ann.operating_income[lastIdx], prev: ann.operating_income[prevIdx] },
            { label: "Net Income",       cur: ann.net_income[lastIdx],       prev: ann.net_income[prevIdx],       bold: true },
          ] : [];
          return (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>

              {/* ── LEFT column ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Price Performance card */}
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--card-border)" }}>
                    <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--t1)" }}>Price Performance</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {OV_PERIODS.map(p => (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                          style={{ fontSize: "0.68rem", padding: "3px 9px", borderRadius: "var(--r-full)", border: `1px solid ${period === p.value ? "var(--orange-border)" : "var(--card-border)"}`, background: period === p.value ? "var(--orange-dim)" : "transparent", color: period === p.value ? "var(--orange)" : "var(--t3)", cursor: "pointer", fontWeight: period === p.value ? 700 : 400, transition: "all 0.12s" }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "8px 0" }}>
                    {history.isLoading ? (
                      <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size="md" /></div>
                    ) : history.data ? (
                      <PlotlyChart
                        data={[{
                          type: "scatter", mode: "lines",
                          x: history.data.dates, y: history.data.close,
                          name: ticker,
                          line: { color: (dayChange ?? 0) >= 0 ? "#86B38A" : "#D48585", width: 2 },
                          fill: "tozeroy",
                          fillcolor: (dayChange ?? 0) >= 0 ? "rgba(134,179,138,0.07)" : "rgba(212,133,133,0.07)",
                          hovertemplate: "%{x}: $%{y:,.2f}<extra></extra>",
                        }]}
                        layout={{
                          margin: { t: 8, b: 32, l: 52, r: 16 },
                          showlegend: false,
                          paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                          xaxis: { showgrid: false, color: isDark ? "rgba(245,245,245,0.4)" : "rgba(17,17,17,0.45)" },
                          yaxis: { showgrid: true, gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", color: isDark ? "rgba(245,245,245,0.4)" : "rgba(17,17,17,0.45)", tickprefix: "$", tickformat: ",.0f" },
                        }}
                        height={320}
                      />
                    ) : null}
                  </div>
                </div>

                {/* Income Statement card */}
                {incomeRows.length > 0 && (
                  <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--card-border)" }}>
                      <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--t1)" }}>Income Statement (TTM)</span>
                      <button onClick={() => setTab("financials")} style={{ fontSize: "0.7rem", color: "var(--orange)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>View Full Financials</button>
                    </div>
                    <div style={{ padding: "0" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "8px 20px", borderBottom: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>Metric</span>
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", textAlign: "right", paddingRight: 32 }}>Value (USD)</span>
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", textAlign: "right", minWidth: 80 }}>YoY Growth</span>
                      </div>
                      {incomeRows.map((row) => {
                        const g = fmtGrowth(row.cur ?? null, row.prev ?? null);
                        return (
                          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                            <span style={{ fontSize: "0.82rem", color: "var(--t2)", fontWeight: (row as { bold?: boolean }).bold ? 700 : 400 }}>{row.label}</span>
                            <span style={{ fontSize: "0.82rem", color: "var(--t1)", fontWeight: (row as { bold?: boolean }).bold ? 700 : 500, fontVariantNumeric: "tabular-nums", textAlign: "right", paddingRight: 32 }}>
                              {row.cur != null ? formatLargeNumber(row.cur) : "—"}
                            </span>
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: g == null ? "var(--t3)" : g >= 0 ? "var(--green)" : "var(--red)", textAlign: "right", minWidth: 80, fontVariantNumeric: "tabular-nums" }}>
                              {g == null ? "—" : `${g >= 0 ? "+" : ""}${g.toFixed(2)}%`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── RIGHT column ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Key Statistics card */}
                <div style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1rem", fontWeight: 700, color: "#F1F5F9" }}>Key Statistics</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "4px 0" }}>
                    {[
                      { label: "MARKET CAP",  value: fund?.marketCap  != null ? formatLargeNumber(n(fund.marketCap))  : "—" },
                      { label: "P/E RATIO",   value: fund?.forwardPE  != null ? formatNumber(n(fund.forwardPE), 1)    : fund?.trailingPE != null ? formatNumber(n(fund.trailingPE), 1) : "—" },
                      { label: "DIV YIELD",   value: fund?.dividendYield != null ? formatPercent(n(fund.dividendYield)) : "—" },
                      { label: "BETA (5Y)",   value: fund?.beta != null ? formatNumber(n(fund.beta), 2)               : "—" },
                      { label: "52W HIGH",    value: fund?.fiftyTwoWeekHigh != null ? formatCurrency(n(fund.fiftyTwoWeekHigh)!, (fund.currency as string) ?? "USD") : "—" },
                      { label: "52W LOW",     value: fund?.fiftyTwoWeekLow  != null ? formatCurrency(n(fund.fiftyTwoWeekLow)!,  (fund.currency as string) ?? "USD") : "—" },
                    ].map((stat, i) => (
                      <div key={stat.label} style={{ padding: "14px 20px", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.06)" : "none", borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(241,245,249,0.45)", marginBottom: 6 }}>{stat.label}</p>
                        <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "#F1F5F9", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  {recLabel != null && (
                    <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(241,245,249,0.45)", marginBottom: 10 }}>
                        Analyst Consensus{fund?.numberOfAnalystOpinions != null && ` · ${String(fund.numberOfAnalystOpinions)} analysts`}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div style={{ width: `${recBarPct}%`, height: "100%", background: recColor, borderRadius: 3, transition: "width 0.4s ease" }} />
                        </div>
                        <span style={{ fontSize: "0.78rem", fontWeight: 800, color: recColor, letterSpacing: "0.04em", flexShrink: 0 }}>{recLabel}</span>
                      </div>
                      {fund?.targetMeanPrice != null && currentPrice != null && (
                        <p style={{ fontSize: "0.68rem", color: "rgba(241,245,249,0.45)", marginTop: 6 }}>
                          Mean target: <span style={{ color: n(fund.targetMeanPrice)! > currentPrice ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{formatCurrency(n(fund.targetMeanPrice)!, (fund.currency as string) ?? "USD")}</span>
                          <span style={{ marginLeft: 6 }}>({((n(fund.targetMeanPrice)! - currentPrice) / currentPrice * 100).toFixed(1)}% upside)</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Recent Insider Trading */}
                {insiders.length > 0 && (
                  <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--card-border)" }}>
                      <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--t1)" }}>Recent Insider Trading</span>
                    </div>
                    <div>
                      {insiders.map((ins, i) => {
                        const isSell = String(ins.Transaction ?? "").toLowerCase().includes("sell") || String(ins.Transaction ?? "").toLowerCase().includes("sale");
                        const txColor = isSell ? "var(--red)" : "var(--green)";
                        const txLabel = isSell ? "Sell" : "Buy";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: i < insiders.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ins.Insider ?? "—"}</p>
                              <p style={{ fontSize: "0.66rem", color: "var(--t3)", marginTop: 2 }}>{ins.Position ?? ""}</p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: txColor }}>{txLabel}</span>
                              {ins.Shares != null && <span style={{ fontSize: "0.66rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{(ins.Shares as number).toLocaleString()} shares</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* About (compact) */}
                {!!fund?.longBusinessSummary && (
                  <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>About</span>
                      {fund?.fullTimeEmployees != null && <span style={{ fontSize: "0.68rem", color: "var(--t2)" }}>{formatLargeNumber(n(fund.fullTimeEmployees))} employees</span>}
                    </div>
                    <p style={{ fontSize: "0.76rem", color: "var(--t2)", lineHeight: 1.6, margin: 0, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {String(fund.longBusinessSummary)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ════ Tab: Financials ════ */}
        {!isSimple && tab === "financials" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Toggle */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ display: "flex", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
                {(["annual", "quarterly"] as FinView[]).map((v) => (
                  <button key={v} onClick={() => setFinView(v)} style={{ padding: "6px 18px", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", background: finView === v ? "var(--orange)" : "var(--bg-card)", color: finView === v ? "#fff" : "var(--t2)", border: "none", cursor: "pointer", transition: "all 0.12s" }}>
                    {v === "annual" ? t.equity.period.annual : t.equity.period.quarterly}
                  </button>
                ))}
              </div>
            </div>
            {financials.isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <SkeletonChart height={120} />
                <SkeletonChart height={200} />
                <SkeletonChart height={200} />
                <SkeletonChart height={200} />
              </div>
            ) : financials.error ? (
              <QueryError error={financials.error as Error} onRetry={() => financials.refetch()} />
            ) : financials.data ? (
              <FinancialsFull data={financials.data[finView]} view={finView} isDark={isDark} />
            ) : null}
          </div>
        )}

        {/* ════ Tab: Charts ════ */}
        {!isSimple && tab === "charts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Key indicators block */}
            {fund && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 0, border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden",
                background: "var(--bg-card)",
              }}>
                {[
                  {
                    label: "52W Range",
                    custom: (() => {
                      const lo = n(fund?.fiftyTwoWeekLow), hi = n(fund?.fiftyTwoWeekHigh), cur = currentPrice;
                      if (lo == null || hi == null || cur == null || hi === lo) return null;
                      const pct = (cur - lo) / (hi - lo);
                      const curr = (fund?.currency as string) ?? "USD";
                      return (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <span style={{ fontSize: "0.65rem", color: "var(--t3)", }}>{formatCurrency(lo, curr)}</span>
                            <span style={{ fontSize: "0.65rem", color: "var(--t3)", }}>{formatCurrency(hi, curr)}</span>
                          </div>
                          <div style={{ height: 4, background: "var(--bg-hover)", borderRadius: 2, position: "relative" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: `linear-gradient(90deg, var(--red), var(--green))`, borderRadius: 2 }} />
                            <div style={{ position: "absolute", top: -3, left: `calc(${pct * 100}% - 4px)`, width: 8, height: 10, background: "var(--orange)", borderRadius: 2 }} />
                          </div>
                          <div style={{ textAlign: "center", marginTop: 5, fontSize: "0.7rem", color: "var(--t1)", fontWeight: 600 }}>
                            {(pct * 100).toFixed(0)}% of range
                          </div>
                        </div>
                      );
                    })(),
                  },
                  { label: "50D SMA",   value: fund?.fiftyDayAverage    != null ? formatCurrency(n(fund.fiftyDayAverage)!,    (fund.currency as string) ?? "USD") : "—", color: currentPrice != null && n(fund?.fiftyDayAverage) != null ? (currentPrice > n(fund.fiftyDayAverage)! ? "var(--green)" : "var(--red)") : "var(--t1)" },
                  { label: "200D SMA",  value: fund?.twoHundredDayAverage != null ? formatCurrency(n(fund.twoHundredDayAverage)!, (fund.currency as string) ?? "USD") : "—", color: currentPrice != null && n(fund?.twoHundredDayAverage) != null ? (currentPrice > n(fund.twoHundredDayAverage)! ? "var(--green)" : "var(--red)") : "var(--t1)" },
                  { label: "Volume",    value: n(fund?.volume) != null ? formatLargeNumber(n(fund.volume)) : "—",         color: "var(--t1)" },
                  { label: "Avg Vol",   value: n(fund?.averageVolume) != null ? formatLargeNumber(n(fund.averageVolume)) : "—", color: "var(--t1)" },
                  { label: "Beta",      value: formatNumber(n(fund?.beta), 2),  color: n(fund?.beta) != null && n(fund.beta)! > 1 ? "var(--red)" : "var(--green)" },
                  { label: "Fwd P/E",   value: formatNumber(n(fund?.forwardPE), 2), color: "var(--t1)" },
                  { label: "Div Yield", value: formatPercent(n(fund?.dividendYield)), color: n(fund?.dividendYield) != null && n(fund.dividendYield)! > 0 ? "var(--green)" : "var(--t3)" },
                ].map((item, i, arr) => (
                  <div key={item.label} style={{
                    padding: "12px 16px",
                    borderRight: i < arr.length - 1 ? "1px solid var(--card-border)" : "none",
                  }}>
                    <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 8 }}>
                      {item.label}
                    </div>
                    {item.custom ?? (
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: (item as { color?: string }).color ?? "var(--t1)" }}>
                        {(item as { value?: string }).value ?? "—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 4 }}>
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: "5px 14px", fontSize: "0.7rem", fontWeight: 600,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    background: period === p ? "var(--orange)" : "var(--bg-card)",
                    color: period === p ? "#fff" : "var(--t2)",
                    border: `1px solid ${period === p ? "var(--orange)" : "var(--card-border)"}`,
                    borderRadius: "var(--r-sm)", cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{
              border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)",
              overflow: "hidden",
            }}>
              {history.isLoading ? (
                <SkeletonChart height={340} />
              ) : history.data ? (
                <TVChart
                  ticker={ticker}
                  dates={history.data.dates}
                  open={history.data.open}
                  high={history.data.high}
                  low={history.data.low}
                  close={history.data.close}
                  volume={history.data.volume}
                  sma50={history.data.sma_50}
                  sma200={history.data.sma_200}
                  height={460}
                  isDark={isDark}
                />
              ) : null}
            </div>
          </div>
        )}

        {/* ════ Tab: Ownership ════ */}
        {!isSimple && tab === "ownership" && (
          <HoldersSection data={holders.data} loading={holders.isLoading} />
        )}

        {/* ════ Tab: Comparison ════ */}
        {!isSimple && tab === "comparison" && (
          <PeerComparison
            mainTicker={ticker}
            peerTickers={peerTickers}
            setPeerTickers={setPeerTickers}
            peerInput={peerInput}
            setPeerInput={setPeerInput}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

/* ─── EquitySimpleView ─── */
interface SimpleViewProps {
  ticker: string;
  fund: Record<string, unknown>;
  stats: { ann_return: number; ann_volatility: number; sharpe_ratio: number; max_drawdown: number; cagr: number } | null;
  history: { dates: string[]; close: number[] } | null;
  currentPrice: number | undefined;
  dayChange: number | null;
  dayChangePct: number | null;
}

function EquitySimpleView({ ticker, fund, stats, history, currentPrice, dayChange, dayChangePct }: SimpleViewProps) {
  const currency = (fund.currency as string) ?? "USD";

  // Compute period returns from history
  function periodReturn(daysBack: number): number | null {
    if (!history?.close || history.close.length < 2) return null;
    const closes = history.close;
    const idx = Math.max(0, closes.length - 1 - daysBack);
    const base = closes[idx];
    const last = closes[closes.length - 1];
    return base ? (last - base) / base : null;
  }
  const r1w  = periodReturn(5);
  const r1m  = periodReturn(21);
  const r3m  = periodReturn(63);
  const r1y  = periodReturn(252);

  const recRaw = fund.recommendationMean as number | undefined;
  const recLabel = recRaw != null
    ? recRaw <= 1.5 ? "Strong Buy" : recRaw <= 2.5 ? "Buy" : recRaw <= 3.5 ? "Hold" : recRaw <= 4.5 ? "Sell" : "Strong Sell"
    : null;
  const recColor = recLabel === "Strong Buy" || recLabel === "Buy" ? "var(--green)"
    : recLabel === "Hold" ? "var(--yellow, #f59e0b)"
    : recLabel ? "var(--red)" : "var(--t3)";

  function KPI({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
    const c = tone === "up" ? "var(--green)" : tone === "down" ? "var(--red)" : "var(--t1)";
    return (
      <div style={{ padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--card-border)", borderRadius: 10 }}>
        <div style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: c, }}>{value}</div>
      </div>
    );
  }

  function ReturnBadge({ label, value }: { label: string; value: number | null }) {
    if (value == null) return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "0.58rem", color: "var(--t3)", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--t3)" }}>—</div>
      </div>
    );
    const pos = value >= 0;
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "0.58rem", color: "var(--t3)", marginBottom: 4, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: pos ? "var(--green)" : "var(--red)", }}>
          {pos ? "+" : ""}{formatPercent(value)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 8 }}>
      {/* ── Performance strip ── */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 12 }}>Performance</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          <ReturnBadge label="1D" value={dayChangePct} />
          <ReturnBadge label="1W" value={r1w} />
          <ReturnBadge label="1M" value={r1m} />
          <ReturnBadge label="3M" value={r3m} />
          <ReturnBadge label="1Y" value={r1y} />
        </div>
      </div>

      {/* ── Key metrics grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }} className="sm:grid-cols-4">
        <KPI label="Market Cap" value={fund.marketCap != null ? formatLargeNumber(fund.marketCap as number) : "—"} />
        <KPI label="P/E (TTM)" value={fund.trailingPE != null ? formatNumber(fund.trailingPE as number, 2) : "—"} />
        <KPI label="Div. Yield" value={fund.dividendYield != null ? formatPercent(fund.dividendYield as number) : "—"} />
        <KPI label="52W Range" value={fund.fiftyTwoWeekLow != null && fund.fiftyTwoWeekHigh != null ? `${formatNumber(fund.fiftyTwoWeekLow as number, 0)} – ${formatNumber(fund.fiftyTwoWeekHigh as number, 0)}` : "—"} />
        {stats && <KPI label="Sharpe (5Y)" value={formatNumber(stats.sharpe_ratio, 2)} tone={stats.sharpe_ratio >= 1 ? "up" : stats.sharpe_ratio < 0 ? "down" : "neutral"} />}
        {stats && <KPI label="Max Drawdown" value={formatPercent(stats.max_drawdown)} tone="down" />}
        {stats && <KPI label="CAGR (5Y)" value={formatPercent(stats.cagr)} tone={stats.cagr > 0 ? "up" : "down"} />}
        <KPI label="ROE" value={fund.returnOnEquity != null ? formatPercent(fund.returnOnEquity as number) : "—"} tone={fund.returnOnEquity != null && (fund.returnOnEquity as number) > 0.10 ? "up" : undefined} />
      </div>

      {/* ── Analyst consensus ── */}
      {(recLabel || fund.targetMeanPrice != null) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {recLabel && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>Analyst Consensus</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: recColor, }}>{recLabel}</div>
              {fund.numberOfAnalystOpinions != null && (
                <div style={{ fontSize: "0.7rem", color: "var(--t3)" }}>{String(fund.numberOfAnalystOpinions)} analysts</div>
              )}
            </div>
          )}
          {fund.targetMeanPrice != null && currentPrice != null && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>Price Target</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--t1)", }}>
                {formatCurrency(fund.targetMeanPrice as number, currency)}
              </div>
              <div style={{ fontSize: "0.7rem", color: (fund.targetMeanPrice as number) > currentPrice ? "var(--green)" : "var(--red)" }}>
                {((((fund.targetMeanPrice as number) - currentPrice) / currentPrice) * 100).toFixed(1)}% upside
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Company description ── */}
      {!!fund.longBusinessSummary && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10 }}>About</div>
          <p style={{ fontSize: "0.78rem", color: "var(--t2)", lineHeight: 1.7, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {String(fund.longBusinessSummary)}
          </p>
        </div>
      )}

      <p style={{ fontSize: "0.72rem", color: "var(--t3)", textAlign: "center" }}>
        Switch to <strong style={{ color: "var(--t2)" }}>Advanced</strong> mode in the header for full analysis, charts, and financial statements.
      </p>
    </div>
  );
}

/* ─── StatKPI ─── */
function StatKPI({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const col = tone === "up" ? "var(--green)" : tone === "down" ? "var(--red)" : "var(--t1)";
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--card-border)",
      borderTop: "1px solid var(--card-border)", borderRadius: "var(--r-xl)",
      padding: "16px 18px", boxShadow: "var(--card-shadow)",
    }}>
      <div style={{
        fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--t3)", marginBottom: 8,
      }}>
        {METRIC_TIPS[label] ? <MetricTooltip label={label} tip={METRIC_TIPS[label]} /> : label}
      </div>
      <div style={{
        fontSize: "1.25rem",
        fontWeight: 700, color: col, letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
    </div>
  );
}

/* ─── FundSection ─── */
type FundRow = [string, string] | [string, string, MetricTone];

function FundSection({ title, rows }: { title: string; rows: FundRow[] }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--card-border)",
      borderRadius: "var(--r-xl)", overflow: "hidden",
    }}>
      <div style={{
        padding: "11px 16px", borderBottom: "1px solid var(--card-border)",
        fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--t3)",
      }}>
        {title}
      </div>
      <div>
        {rows.map(([label, value, tone], i) => (
          <div
            key={label}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 16px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--card-border)" : "none",
              background: i % 2 === 1 ? "var(--bg-hover)" : "transparent",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: "var(--t2)" }}>
              {METRIC_TIPS[label]
                ? <MetricTooltip label={label} tip={METRIC_TIPS[label]} />
                : label
              }
            </span>
            <span style={{
              display: "flex", alignItems: "center",
              fontSize: "0.78rem", 
              fontWeight: 500, color: "var(--t1)",
            }}>
              {value}
              <ToneDot tone={tone as MetricTone} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── FinancialsFull ─── */
function FinancialsFull({ data, view, isDark }: { data: FinancialPeriod; view: FinView; isDark: boolean }) {
  if (!data?.dates?.length) {
    return (
      <div style={{ padding: 24, border: "1px solid var(--card-border)", background: "var(--bg-card)", borderRadius: "var(--r-xl)", color: "var(--t3)", fontSize: "0.8rem" }}>
        No financial data available.
      </div>
    );
  }

  const n = data.dates.length;
  // Show most recent 5 periods
  const showCount = Math.min(n, 5);
  const startIdx = n - showCount;

  const periodLabels = data.dates.slice(startIdx).map((d) => {
    const dt = new Date(d);
    if (view === "annual") return String(dt.getFullYear());
    return `Q${Math.ceil((dt.getMonth() + 1) / 3)} '${String(dt.getFullYear()).slice(2)}`;
  });

  const slice = <T,>(arr: (T | null)[] | undefined): (T | null)[] =>
    arr ? arr.slice(startIdx) : Array(showCount).fill(null);

  const rev   = slice(data.revenue);
  const gp    = slice(data.gross_profit);
  const oi    = slice(data.operating_income);
  const ebi   = slice(data.ebitda);
  const ni    = slice(data.net_income);
  const eps   = slice(data.eps_diluted);
  const fcf   = slice(data.free_cash_flow);
  const gm    = slice(data.gross_margin);
  const om    = slice(data.operating_margin);
  const nm    = slice(data.net_margin);

  // For prev-period reference (YoY) we need the period just before startIdx
  const prevOf = (arr: (number | null)[] | undefined, sliceIdx: number): number | null => {
    if (!arr) return null;
    const absIdx = startIdx + sliceIdx - 1;
    return absIdx >= 0 ? (arr[absIdx] ?? null) : null;
  };

  const yoy = (cur: number | null, prev: number | null): number | null => {
    if (cur == null || prev == null) return null;
    // Sign change or zero base: N/M (not meaningful as %)
    if (prev === 0 || (prev < 0 && cur > 0) || (prev > 0 && cur < 0)) return null;
    const g = ((cur - prev) / Math.abs(prev)) * 100;
    if (!isFinite(g) || Math.abs(g) > 999) return null;
    return g;
  };

  const fmtGrowth = (g: number | null) => {
    if (g == null) return { text: "—", color: "var(--t3)" };
    return { text: `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`, color: g >= 0 ? "var(--green)" : "var(--red)" };
  };

  const last = showCount - 1;
  const latestRev = rev[last] as number | null;
  const latestNI  = ni[last]  as number | null;
  const latestGM  = gm[last]  as number | null;
  const latestOM  = om[last]  as number | null;
  const latestEPS = eps[last] as number | null;
  const prevRev   = prevOf(data.revenue, last);
  const prevNI    = prevOf(data.net_income, last);

  const revGrowth = yoy(latestRev, prevRev);
  const niGrowth  = yoy(latestNI, prevNI);

  // Header style
  const TH: React.CSSProperties = {
    fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--t3)",
    padding: "8px 12px", textAlign: "right" as const,
    background: "var(--bg-inner)",
  };
  const TH_LABEL: React.CSSProperties = {
    ...TH, textAlign: "left" as const, minWidth: 160,
  };
  const TD_NUM: React.CSSProperties = {
    fontVariantNumeric: "tabular-nums", fontSize: "0.82rem",
    color: "var(--t1)", padding: "9px 12px", textAlign: "right" as const,
  };
  const TD_LABEL: React.CSSProperties = {
    fontSize: "0.78rem", color: "var(--t2)", padding: "9px 12px",
  };
  const TD_GROWTH = (g: number | null): React.CSSProperties => ({
    fontVariantNumeric: "tabular-nums", fontSize: "0.75rem",
    fontWeight: 700,
    color: g == null ? "var(--t3)" : g >= 0 ? "var(--green)" : "var(--red)",
    padding: "9px 10px", textAlign: "right" as const,
  });

  const CARD: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--card-border)",
    borderRadius: "var(--r-xl)", overflow: "hidden",
  };
  const CARD_HDR: React.CSSProperties = {
    fontFamily: "Manrope, DM Sans, sans-serif",
    fontSize: "0.88rem", fontWeight: 700, color: "var(--t1)",
    padding: "14px 16px", borderBottom: "1px solid var(--card-border)",
  };

  const scaleB = (arr: (number | null)[]): (number | null)[] =>
    arr.map((v) => v != null ? +(v / 1e9).toFixed(3) : null);

  const chartLabels = periodLabels;

  // OCF margin = (operating_cash_flow / revenue) - we don't have OCF separate from FCF in type
  // Use FCF margin = FCF / Revenue instead
  const fcfMarginArr: (number | null)[] = fcf.map((f, i) => {
    const r = rev[i] as number | null;
    if (f == null || r == null || r === 0) return null;
    return (f as number) / r;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── 1. KPI strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden", background: "var(--bg-card)" }}>
        {/* Revenue */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--card-border)" }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>Revenue</div>
          <div style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {latestRev != null ? fmtBig(latestRev) : "—"}
          </div>
          {revGrowth != null && (
            <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: "var(--r-full)", background: revGrowth >= 0 ? "rgba(134,179,138,0.15)" : "rgba(212,133,133,0.15)", fontSize: "0.65rem", fontWeight: 700, color: revGrowth >= 0 ? "var(--green)" : "var(--red)" }}>
              {revGrowth >= 0 ? "+" : ""}{revGrowth.toFixed(1)}% YoY
            </div>
          )}
        </div>
        {/* Gross Margin */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--card-border)" }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>Gross Margin</div>
          <div style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: latestGM != null && latestGM > 0.3 ? "var(--green)" : "var(--t1)", fontVariantNumeric: "tabular-nums" }}>
            {latestGM != null ? `${(latestGM * 100).toFixed(1)}%` : "—"}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.62rem", color: "var(--t3)" }}>of revenue</div>
        </div>
        {/* Operating Margin */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--card-border)" }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>Op. Margin</div>
          <div style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: latestOM != null ? (latestOM >= 0 ? "var(--green)" : "var(--red)") : "var(--t1)", fontVariantNumeric: "tabular-nums" }}>
            {latestOM != null ? `${(latestOM * 100).toFixed(1)}%` : "—"}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.62rem", color: "var(--t3)" }}>EBIT / Revenue</div>
        </div>
        {/* Net Income */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--card-border)" }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>Net Income</div>
          <div style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: latestNI != null ? (latestNI >= 0 ? "var(--green)" : "var(--red)") : "var(--t1)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {latestNI != null ? fmtBig(latestNI) : "—"}
          </div>
          {niGrowth != null && (
            <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: "var(--r-full)", background: niGrowth >= 0 ? "rgba(134,179,138,0.15)" : "rgba(212,133,133,0.15)", fontSize: "0.65rem", fontWeight: 700, color: niGrowth >= 0 ? "var(--green)" : "var(--red)" }}>
              {niGrowth >= 0 ? "+" : ""}{niGrowth.toFixed(1)}% YoY
            </div>
          )}
        </div>
        {/* EPS Diluted */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>EPS Diluted</div>
          <div style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: latestEPS != null ? (latestEPS >= 0 ? "var(--t1)" : "var(--red)") : "var(--t1)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {latestEPS != null ? `$${latestEPS.toFixed(2)}` : "—"}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.62rem", color: "var(--t3)" }}>per diluted share</div>
        </div>
      </div>

      {/* ── 2. Income Statement table ── */}
      <div style={CARD}>
        <div style={CARD_HDR}>Income Statement</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH_LABEL}>Metric</th>
                {periodLabels.map((lbl, i) => (
                  <th key={i} style={TH}>{lbl}<br /><span style={{ fontSize: "0.5rem", fontWeight: 400, color: "var(--t3)", textTransform: "none", letterSpacing: 0 }}>YoY</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Total Revenue",    arr: rev,  bold: true  },
                { label: "Gross Profit",     arr: gp,   bold: false },
                { label: "Operating Income", arr: oi,   bold: false },
                { label: "EBITDA",           arr: ebi,  bold: false },
                { label: "Net Income",       arr: ni,   bold: true  },
                { label: "EPS Diluted ($)",  arr: eps,  bold: false, isEPS: true },
              ].map(({ label, arr, bold, isEPS }) => (
                <tr key={label} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td style={{ ...TD_LABEL, fontWeight: bold ? 700 : 400 }}>{label}</td>
                  {arr.map((v, si) => {
                    const prev = prevOf(
                      label === "Total Revenue" ? data.revenue :
                      label === "Gross Profit" ? data.gross_profit :
                      label === "Operating Income" ? data.operating_income :
                      label === "EBITDA" ? data.ebitda :
                      label === "Net Income" ? data.net_income :
                      data.eps_diluted,
                      si
                    );
                    const g = yoy(v as number | null, prev);
                    const fg = fmtGrowth(g);
                    return (
                      <td key={si} style={{ borderLeft: "1px solid var(--card-border)", padding: 0 }}>
                        <div style={{ ...TD_NUM, paddingBottom: 4, fontWeight: bold ? 700 : 400 }}>
                          {v == null ? "—" : isEPS ? `$${(v as number).toFixed(2)}` : fmtBig(v as number)}
                        </div>
                        <div style={{ ...TD_GROWTH(g), paddingTop: 0, fontSize: "0.68rem" }}>{fg.text}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Gross Margin row */}
              <tr style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                <td style={{ ...TD_LABEL, fontSize: "0.72rem", color: "var(--t3)" }}>Gross Margin %</td>
                {gm.map((v, si) => (
                  <td key={si} style={{ ...TD_NUM, borderLeft: "1px solid var(--card-border)", color: v != null ? (v as number) > 0.3 ? "var(--green)" : "var(--t1)" : "var(--t3)" }}>
                    {v != null ? `${((v as number) * 100).toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                <td style={{ ...TD_LABEL, fontSize: "0.72rem", color: "var(--t3)" }}>Op. Margin %</td>
                {om.map((v, si) => (
                  <td key={si} style={{ ...TD_NUM, borderLeft: "1px solid var(--card-border)", color: v != null ? (v as number) >= 0 ? "var(--green)" : "var(--red)" : "var(--t3)" }}>
                    {v != null ? `${((v as number) * 100).toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                <td style={{ ...TD_LABEL, fontSize: "0.72rem", color: "var(--t3)" }}>Net Margin %</td>
                {nm.map((v, si) => (
                  <td key={si} style={{ ...TD_NUM, borderLeft: "1px solid var(--card-border)", color: v != null ? (v as number) >= 0 ? "var(--green)" : "var(--red)" : "var(--t3)" }}>
                    {v != null ? `${((v as number) * 100).toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3. Cash Flow table ── */}
      <div style={CARD}>
        <div style={CARD_HDR}>Cash Flow</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH_LABEL}>Metric</th>
                {periodLabels.map((lbl, i) => <th key={i} style={TH}>{lbl}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                <td style={TD_LABEL}>Free Cash Flow</td>
                {fcf.map((v, si) => {
                  const prev = prevOf(data.free_cash_flow, si);
                  const g = yoy(v as number | null, prev);
                  const fg = fmtGrowth(g);
                  return (
                    <td key={si} style={{ borderLeft: "1px solid var(--card-border)", padding: 0 }}>
                      <div style={{ ...TD_NUM, paddingBottom: 4, fontWeight: 700, color: v == null ? "var(--t3)" : (v as number) >= 0 ? "var(--green)" : "var(--red)" }}>
                        {v == null ? "—" : fmtBig(v as number)}
                      </div>
                      <div style={{ ...TD_GROWTH(g), paddingTop: 0, fontSize: "0.68rem" }}>{fg.text}</div>
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-inner)" }}>
                <td style={{ ...TD_LABEL, fontSize: "0.72rem", color: "var(--t3)" }}>FCF Margin %</td>
                {fcfMarginArr.map((v, si) => (
                  <td key={si} style={{ ...TD_NUM, borderLeft: "1px solid var(--card-border)", color: v != null ? (v as number) >= 0 ? "var(--green)" : "var(--red)" : "var(--t3)" }}>
                    {v != null ? `${((v as number) * 100).toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                <td style={TD_LABEL}>EBITDA</td>
                {ebi.map((v, si) => (
                  <td key={si} style={{ ...TD_NUM, borderLeft: "1px solid var(--card-border)" }}>
                    {v == null ? "—" : fmtBig(v as number)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. FCF Yield card ── */}
      <div style={CARD}>
        <div style={CARD_HDR}>Free Cash Flow per Period</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH_LABEL}>Period</th>
                <th style={TH}>Free Cash Flow</th>
                <th style={TH}>FCF Margin</th>
                <th style={TH}>vs. Prior Period</th>
              </tr>
            </thead>
            <tbody>
              {periodLabels.map((lbl, si) => {
                const fv = fcf[si] as number | null;
                const margin = fcfMarginArr[si] as number | null;
                const absIdx = startIdx + si;
                const priorFCF = absIdx > 0 ? (data.free_cash_flow?.[absIdx - 1] ?? null) : null;
                const g = yoy(fv, priorFCF);
                const fg = fmtGrowth(g);
                return (
                  <tr key={lbl} style={{ borderTop: "1px solid var(--card-border)", background: si % 2 === 1 ? "var(--bg-inner)" : "transparent" }}>
                    <td style={{ ...TD_LABEL, fontWeight: 600 }}>{lbl}</td>
                    <td style={{ ...TD_NUM, fontWeight: 700, color: fv == null ? "var(--t3)" : fv >= 0 ? "var(--green)" : "var(--red)" }}>
                      {fv == null ? "—" : fmtBig(fv)}
                    </td>
                    <td style={{ ...TD_NUM, color: margin == null ? "var(--t3)" : margin >= 0 ? "var(--green)" : "var(--red)" }}>
                      {margin != null ? `${(margin * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td style={TD_GROWTH(g)}>{fg.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Charts side-by-side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Revenue vs Net Income bar */}
        <div style={CARD}>
          <div style={CARD_HDR}>Revenue vs Net Income (B)</div>
          <div style={{ padding: "10px 12px 6px" }}>
            <FinBarChart
              labels={chartLabels}
              series={[
                { name: "Revenue",    data: scaleB(rev as (number | null)[]),  color: "#5B8FD4" },
                { name: "Net Income", data: scaleB(ni  as (number | null)[]),  color: "#5BA87A" },
              ]}
              yUnit="B"
              height={160}
            />
          </div>
        </div>
        {/* Margins line chart */}
        <div style={CARD}>
          <div style={CARD_HDR}>Profit Margins (%)</div>
          <div style={{ padding: "10px 12px 6px" }}>
            <FinAreaLineChart
              labels={chartLabels}
              series={[
                { name: "Gross",     data: gm.map(v => v != null ? +((v as number) * 100).toFixed(2) : null), color: "#5BA87A" },
                { name: "Operating", data: om.map(v => v != null ? +((v as number) * 100).toFixed(2) : null), color: "#5B8FD4" },
                { name: "Net",       data: nm.map(v => v != null ? +((v as number) * 100).toFixed(2) : null), color: "#C9A84C" },
              ]}
              yUnit="%"
              height={160}
            />
          </div>
        </div>
      </div>

      {/* ── 6. Full FinancialCharts (existing component) ── */}
      <FinancialCharts data={data} view={view} />
    </div>
  );
}

/* ─── FinancialCharts ─── */
function FinancialCharts({ data, view }: { data: FinancialPeriod; view: FinView }) {
  if (!data?.dates?.length) {
    return (
      <div style={{
        padding: 24, border: "1px solid var(--card-border)", background: "var(--bg-card)",
        borderRadius: "var(--r-xl)", color: "var(--t3)", fontSize: "0.8rem",
      }}>
        No financial data available.
      </div>
    );
  }

  const labels = data.dates.map((d) => {
    const dt = new Date(d);
    if (view === "annual") return String(dt.getFullYear());
    return `Q${Math.ceil((dt.getMonth() + 1) / 3)} '${String(dt.getFullYear()).slice(2)}`;
  });

  const scaleB = (arr: (number | null)[]) => arr.map((v) => v != null ? +(v / 1e9).toFixed(3) : null);

  const card = (title: string, content: React.ReactNode) => (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--card-border)",
      borderTop: "2px solid var(--orange)",
      borderRadius: "var(--r-xl)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px",
        borderBottom: "1px solid var(--card-border)",
        fontSize: "0.62rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--t3)",
      }}>
        {title}
      </div>
      <div style={{ padding: "10px 12px 6px" }}>{content}</div>
    </div>
  );

  // Compute latest values for KPI strip
  const last = labels.length - 1;
  const latestRevenue   = data.revenue?.[last];
  const latestNetIncome = data.net_income?.[last];
  const latestGrossM    = data.gross_margin?.[last];
  const latestNetM      = data.net_margin?.[last];
  const latestOpM       = data.operating_margin?.[last];
  const latestFCF       = data.free_cash_flow?.[last];
  const latestEPS       = data.eps_diluted?.[last];

  const kpis: { label: string; value: string; color?: string }[] = [
    { label: "Revenue",      value: latestRevenue   != null ? `${(latestRevenue / 1e9).toFixed(2)}B`    : "—" },
    { label: "Net Income",   value: latestNetIncome != null ? `${(latestNetIncome / 1e9).toFixed(2)}B`  : "—", color: latestNetIncome != null && latestNetIncome >= 0 ? "var(--green)" : "var(--red)" },
    { label: "Gross Margin", value: latestGrossM    != null ? `${(latestGrossM * 100).toFixed(1)}%`     : "—", color: "var(--t1)" },
    { label: "Op. Margin",   value: latestOpM       != null ? `${(latestOpM * 100).toFixed(1)}%`        : "—", color: latestOpM != null && latestOpM >= 0 ? "var(--green)" : "var(--red)" },
    { label: "Net Margin",   value: latestNetM      != null ? `${(latestNetM * 100).toFixed(1)}%`       : "—", color: latestNetM != null && latestNetM >= 0 ? "var(--green)" : "var(--red)" },
    { label: "Free CF",      value: latestFCF       != null ? `${(latestFCF / 1e9).toFixed(2)}B`       : "—", color: latestFCF != null && latestFCF >= 0 ? "var(--green)" : "var(--red)" },
    { label: "EPS (dil.)",   value: latestEPS       != null ? `$${latestEPS.toFixed(2)}`                : "—", color: latestEPS != null && latestEPS >= 0 ? "var(--green)" : "var(--red)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* KPI strip — latest period snapshot */}
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
        border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden",
        background: "var(--bg-card)",
      }}>
        {kpis.map((k, i) => (
          <div key={k.label} style={{
            padding: "12px 14px",
            borderRight: i < kpis.length - 1 ? "1px solid var(--card-border)" : "none",
          }}>
            <div style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: k.color ?? "var(--t1)" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue breakdown — stacked bar style */}
      {card("Revenue / Gross Profit / Net Income (B)", (
        <FinBarChart labels={labels} series={[
          { name: "Revenue",      data: scaleB(data.revenue),      color: "#5B8FD4" },
          { name: "Gross Profit", data: scaleB(data.gross_profit), color: "#5BA87A" },
          { name: "Net Income",   data: scaleB(data.net_income),   color: "#C9A84C" },
        ]} yUnit="B" height={160} />
      ))}

      {/* Margins area chart */}
      {card("Profit Margins (%)", (
        <FinAreaLineChart labels={labels} series={[
          { name: "Gross",     data: data.gross_margin?.map(v => v != null ? +(v * 100).toFixed(2) : null) ?? [],     color: "#5BA87A" },
          { name: "Operating", data: data.operating_margin?.map(v => v != null ? +(v * 100).toFixed(2) : null) ?? [], color: "#5B8FD4" },
          { name: "Net",       data: data.net_margin?.map(v => v != null ? +(v * 100).toFixed(2) : null) ?? [],       color: "#C9A84C" },
        ]} yUnit="%" height={160} />
      ))}

      {/* EPS + FCF dual bar */}
      {card("EPS (Diluted) & Free Cash Flow", (
        <FinDualBarChart labels={labels}
          leftSeries={{ name: "EPS", data: data.eps_diluted, color: "#9575D4", unit: "$" }}
          rightSeries={{ name: "FCF", data: scaleB(data.free_cash_flow), color: "#4BAAA6", negColor: "#C96B6B", unit: "B" }}
          height={160}
        />
      ))}

      {/* YoY growth bars */}
      {data.revenue && data.revenue.length >= 2 && card("YoY Revenue Growth (%)", (() => {
        const growthData: (number | null)[] = data.revenue!.map((v, i) => {
          const prev = data.revenue![i - 1];
          if (i === 0 || v == null || prev == null || prev === 0) return null;
          if ((prev < 0 && v > 0) || (prev > 0 && v < 0)) return null; // sign change → N/M
          const g = +((v / prev - 1) * 100).toFixed(2);
          if (!isFinite(g) || Math.abs(g) > 999) return null;
          return g;
        });
        return (
          <FinBarChart labels={labels} series={[
            { name: "Rev Growth %", data: growthData, color: "#5B8FD4" },
          ]} yUnit="%" height={130} />
        );
      })())}

    </div>
  );
}

/* ─── FinAreaLineChart ─── */
function FinAreaLineChart({ labels, series, yUnit = "", height = 280 }: {
  labels: string[];
  series: { name: string; data: (number | null)[]; color: string }[];
  yUnit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<{ idx: number; pctX: number } | null>(null);
  const W = SVG_W, H = height;
  const PW = W - ML - MR, PH = H - MT - MB;

  const vals = series.flatMap(s => s.data).filter((v): v is number => v != null);
  const { min, max, ticks } = niceAxis(vals);
  const yRange = max - min || 1;
  const n = labels.length;
  const toX = (i: number) => ML + (n > 1 ? (i / (n - 1)) * PW : PW / 2);
  const toY = (v: number) => MT + PH - ((v - min) / yRange) * PH;

  const legendItemW = 88;
  const legendTotalW = series.length * legendItemW;
  const legendStartX = (W - legendTotalW) / 2;

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        <rect x={ML} y={MT} width={PW} height={PH} style={{ fill: "var(--bg-hover)" }} opacity={0.25} rx={2} />
        {ticks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={i}>
              <line x1={ML} x2={W - MR} y1={y} y2={y} style={{ stroke: "var(--card-border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 6} y={y + 3.5} textAnchor="end" fontSize={7.5} style={{ fill: "var(--t3)" }}>
                {t.toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} style={{ fill: "var(--orange)" }} fontWeight="700">{yUnit}</text>
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />

        {/* Filled areas (back to front = lowest opacity first) */}
        {[...series].reverse().map(s => {
          const pts: [number, number][] = s.data
            .map((v, i) => (v != null ? [toX(i), toY(v)] as [number, number] : null))
            .filter((p): p is [number, number] => p != null);
          if (pts.length < 2) return null;
          const baseY = MT + PH;
          const area = `M${pts[0][0]},${baseY} ` + pts.map(p => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length - 1][0]},${baseY} Z`;
          return <path key={`${s.name}-area`} d={area} style={{ fill: s.color }} opacity={0.15} />;
        })}

        {/* Lines */}
        {series.map(s => {
          const segments: string[][] = [];
          let cur: string[] = [];
          s.data.forEach((v, i) => {
            if (v != null) { cur.push(`${toX(i)},${toY(v)}`); }
            else if (cur.length) { segments.push(cur); cur = []; }
          });
          if (cur.length) segments.push(cur);
          return segments.map((seg, si) => (
            <polyline key={`${s.name}-${si}`} points={seg.join(" ")} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeLinejoin="round" />
          ));
        })}

        {/* Dots on hover */}
        {hover && series.map(s => {
          const v = s.data[hover.idx];
          if (v == null) return null;
          return <circle key={s.name} cx={toX(hover.idx)} cy={toY(v)} r={5} style={{ fill: s.color, stroke: "var(--bg-card)" }} strokeWidth={1.8} />;
        })}

        {hover && <line x1={toX(hover.idx)} x2={toX(hover.idx)} y1={MT} y2={MT + PH} style={{ stroke: "var(--t2)" }} strokeWidth={1} strokeDasharray="5 3" opacity={0.5} />}

        {labels.map((_, i) => {
          const hw = n > 1 ? PW / (n - 1) / 2 : PW;
          return (
            <rect key={i} x={Math.max(ML, toX(i) - hw)} y={MT} width={Math.min(hw * 2, PW)} height={PH}
              fill="transparent" style={{ cursor: "crosshair" }}
              onMouseEnter={() => setHover({ idx: i, pctX: n > 1 ? i / (n - 1) : 0.5 })} />
          );
        })}

        {labels.map((lbl, i) => (
          <text key={i} x={toX(i)} y={H - MB + 14} textAnchor="middle" fontSize={7.5} style={{ fill: "var(--t3)" }}>{lbl}</text>
        ))}

        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <line x1={0} y1={5} x2={12} y2={5} style={{ stroke: s.color }} strokeWidth={2} />
            <circle cx={6} cy={5} r={3} style={{ fill: s.color, stroke: "var(--bg-card)" }} strokeWidth={1.5} />
            <text x={17} y={9} fontSize={7.5} style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
          </g>
        ))}
      </svg>

      {hover && (
        <Tooltip hover={hover} labels={labels} items={series.map(s => ({
          name: s.name, color: s.color,
          value: s.data[hover.idx] != null ? `${s.data[hover.idx]!.toFixed(1)} ${yUnit}` : "—",
        }))} />
      )}
    </div>
  );
}

/* ─── Custom SVG Financial Chart Primitives ─── */

const SVG_W = 760;
const ML = 44, MR = 14, MT = 22, MB = 28;

function niceAxis(vals: number[]): { min: number; max: number; ticks: number[] } {
  const hasVals = vals.filter(v => isFinite(v));
  if (!hasVals.length) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  const mn = Math.min(0, ...hasVals);
  const mx = Math.max(0, ...hasVals);
  const range = mx - mn || 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(range / 4)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => (mx - mn) / s <= 5) ?? magnitude;
  const min = Math.floor(mn / step) * step;
  const max = Math.ceil(mx / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step * 0.01; t += step) ticks.push(+t.toFixed(10));
  return { min, max, ticks };
}

function Tooltip({ hover, labels, items }: {
  hover: { idx: number; pctX: number };
  labels: string[];
  items: { name: string; color: string; value: string }[];
}) {
  const flip = hover.pctX > 0.62;
  return (
    <div style={{
      position: "absolute",
      left: `calc(${hover.pctX * 100}% + ${flip ? "-8px" : "8px"})`,
      top: "6%",
      transform: flip ? "translateX(-100%)" : "none",
      background: "var(--bg-card)",
      border: "1px solid var(--card-border)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 11,
      
      pointerEvents: "none",
      zIndex: 20,
      minWidth: 160,
      boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
        {labels[hover.idx]}
      </div>
      {items.map(it => (
        <div key={it.name} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 2 }}>
          <span style={{ color: it.color, fontWeight: 600 }}>{it.name}</span>
          <span style={{ color: "var(--t1)" }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function FinBarChart({ labels, series, yUnit = "", height = 280 }: {
  labels: string[];
  series: { name: string; data: (number | null)[]; color: string }[];
  yUnit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<{ idx: number; pctX: number } | null>(null);
  const W = SVG_W, H = height;
  const PW = W - ML - MR, PH = H - MT - MB;

  const vals = series.flatMap(s => s.data).filter((v): v is number => v != null);
  const { min, max, ticks } = niceAxis(vals);
  const yRange = max - min || 1;
  const toY = (v: number) => MT + PH - ((v - min) / yRange) * PH;
  const zY = toY(0);

  const n = labels.length, m = series.length;
  const groupW = PW / n;
  const barW = Math.max(4, Math.min(20, (groupW * 0.72) / m));
  const groupPad = (groupW - barW * m) / 2;

  const legendItemW = 95;
  const legendTotalW = series.length * legendItemW;
  const legendStartX = (W - legendTotalW) / 2;

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Plot area background */}
        <rect x={ML} y={MT} width={PW} height={PH} style={{ fill: "var(--bg-hover)" }} opacity={0.25} rx={2} />

        {/* Y grid + ticks */}
        {ticks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={i}>
              <line x1={ML} x2={W - MR} y1={y} y2={y} style={{ stroke: "var(--card-border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 6} y={y + 3.5} textAnchor="end" fontSize={7.5} style={{ fill: "var(--t3)" }}>
                {Math.abs(t) >= 100 ? t.toFixed(0) : Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Y unit label */}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} style={{ fill: "var(--orange)" }} fontWeight="700">{yUnit}</text>

        {/* Axis borders */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />

        {/* Zero baseline */}
        {min < 0 && <line x1={ML} x2={W - MR} y1={zY} y2={zY} style={{ stroke: "var(--t3)" }} strokeWidth={1} strokeDasharray="3 2" opacity={0.6} />}

        {/* Bars + hover areas */}
        {labels.map((lbl, gi) => {
          const gx = ML + gi * groupW + groupPad;
          const isH = hover?.idx === gi;
          return (
            <g key={lbl}>
              {isH && <rect x={ML + gi * groupW + 1} y={MT + 1} width={groupW - 2} height={PH - 1} style={{ fill: "var(--bg-hover)" }} opacity={0.6} rx={2} />}
              {series.map((s, si) => {
                const v = s.data[gi];
                if (v == null) return null;
                const bx = gx + si * barW;
                const by = toY(Math.max(0, v)), by0 = toY(Math.min(0, v));
                return (
                  <rect key={s.name} x={bx} y={Math.min(by, by0)} width={barW - 1.5}
                    height={Math.max(2, Math.abs(by0 - by))} rx={2}
                    style={{ fill: s.color }} opacity={hover && !isH ? 0.25 : 0.9} />
                );
              })}
              {isH && <line x1={ML + gi * groupW + groupW / 2} x2={ML + gi * groupW + groupW / 2} y1={MT} y2={MT + PH} style={{ stroke: "var(--t2)" }} strokeWidth={1} opacity={0.4} />}
              <rect x={ML + gi * groupW} y={MT} width={groupW} height={PH} fill="transparent" style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHover({ idx: gi, pctX: (gi + 0.5) / n })} />
              <text x={ML + gi * groupW + groupW / 2} y={H - MB + 14} textAnchor="middle" fontSize={7.5} style={{ fill: "var(--t3)" }}>{lbl}</text>
            </g>
          );
        })}

        {/* Centered legend */}
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <rect x={0} y={1} width={9} height={9} rx={2} style={{ fill: s.color }} opacity={0.9} />
            <text x={13} y={9} fontSize={7.5} style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
          </g>
        ))}
      </svg>

      {hover && (
        <Tooltip hover={hover} labels={labels} items={series.map(s => ({
          name: s.name, color: s.color,
          value: s.data[hover.idx] != null ? `${s.data[hover.idx]!.toFixed(2)} ${yUnit}` : "—",
        }))} />
      )}
    </div>
  );
}

function FinLineChart({ labels, series, yUnit = "", height = 280 }: {
  labels: string[];
  series: { name: string; data: (number | null)[]; color: string }[];
  yUnit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<{ idx: number; pctX: number } | null>(null);
  const W = SVG_W, H = height;
  const PW = W - ML - MR, PH = H - MT - MB;

  const vals = series.flatMap(s => s.data).filter((v): v is number => v != null);
  const { min, max, ticks } = niceAxis(vals);
  const yRange = max - min || 1;
  const n = labels.length;
  const toX = (i: number) => ML + (n > 1 ? (i / (n - 1)) * PW : PW / 2);
  const toY = (v: number) => MT + PH - ((v - min) / yRange) * PH;

  const legendItemW = 88;
  const legendTotalW = series.length * legendItemW;
  const legendStartX = (W - legendTotalW) / 2;

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Plot area background */}
        <rect x={ML} y={MT} width={PW} height={PH} style={{ fill: "var(--bg-hover)" }} opacity={0.25} rx={2} />

        {/* Y grid + ticks */}
        {ticks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={i}>
              <line x1={ML} x2={W - MR} y1={y} y2={y} style={{ stroke: "var(--card-border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 6} y={y + 3.5} textAnchor="end" fontSize={7.5} style={{ fill: "var(--t3)" }}>
                {t.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Y unit label */}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} style={{ fill: "var(--orange)" }} fontWeight="700">{yUnit}</text>

        {/* Axis borders */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />

        {/* Area fills */}
        {series.map(s => {
          const pts: [number, number][] = s.data
            .map((v, i) => (v != null ? [toX(i), toY(v)] as [number, number] : null))
            .filter((p): p is [number, number] => p != null);
          if (pts.length < 2) return null;
          const baseY = MT + PH;
          const area = `M${pts[0][0]},${baseY} ` + pts.map(p => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length - 1][0]},${baseY} Z`;
          return <path key={`${s.name}-area`} d={area} style={{ fill: s.color }} opacity={0.09} />;
        })}

        {/* Lines */}
        {series.map(s => {
          const segments: string[][] = [];
          let cur: string[] = [];
          s.data.forEach((v, i) => {
            if (v != null) { cur.push(`${toX(i)},${toY(v)}`); }
            else if (cur.length) { segments.push(cur); cur = []; }
          });
          if (cur.length) segments.push(cur);
          return segments.map((seg, si) => (
            <polyline key={`${s.name}-${si}`} points={seg.join(" ")} fill="none" style={{ stroke: s.color }} strokeWidth={2.2} strokeLinejoin="round" />
          ));
        })}

        {/* Dots */}
        {series.map(s => s.data.map((v, i) => {
          if (v == null) return null;
          const isH = hover?.idx === i;
          return (
            <circle key={`${s.name}-${i}`} cx={toX(i)} cy={toY(v)}
              r={isH ? 5.5 : 3.5}
              style={{ fill: s.color, stroke: "var(--bg-card)" }}
              strokeWidth={1.8}
            />
          );
        }))}

        {/* Hover vertical */}
        {hover && (
          <line x1={toX(hover.idx)} x2={toX(hover.idx)} y1={MT} y2={MT + PH}
            style={{ stroke: "var(--t2)" }} strokeWidth={1} strokeDasharray="5 3" opacity={0.5} />
        )}

        {/* Hover capture rects */}
        {labels.map((_, i) => {
          const hw = n > 1 ? PW / (n - 1) / 2 : PW;
          return (
            <rect key={i} x={Math.max(ML, toX(i) - hw)} y={MT} width={Math.min(hw * 2, PW)} height={PH}
              fill="transparent" style={{ cursor: "crosshair" }}
              onMouseEnter={() => setHover({ idx: i, pctX: n > 1 ? i / (n - 1) : 0.5 })} />
          );
        })}

        {/* X labels */}
        {labels.map((lbl, i) => (
          <text key={i} x={toX(i)} y={H - MB + 14} textAnchor="middle" fontSize={7.5} style={{ fill: "var(--t3)" }}>{lbl}</text>
        ))}

        {/* Centered legend (line + dot style) */}
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <line x1={0} y1={5} x2={12} y2={5} style={{ stroke: s.color }} strokeWidth={2} />
            <circle cx={6} cy={5} r={3} style={{ fill: s.color, stroke: "var(--bg-card)" }} strokeWidth={1.5} />
            <text x={17} y={9} fontSize={7.5} style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
          </g>
        ))}
      </svg>

      {hover && (
        <Tooltip hover={hover} labels={labels} items={series.map(s => ({
          name: s.name, color: s.color,
          value: s.data[hover.idx] != null ? `${s.data[hover.idx]!.toFixed(1)} ${yUnit}` : "—",
        }))} />
      )}
    </div>
  );
}

function FinDualBarChart({ labels, leftSeries, rightSeries, height = 280 }: {
  labels: string[];
  leftSeries: { name: string; data: (number | null)[]; color: string; unit: string };
  rightSeries: { name: string; data: (number | null)[]; color: string; negColor: string; unit: string };
  height?: number;
}) {
  const [hover, setHover] = useState<{ idx: number; pctX: number } | null>(null);
  const W = SVG_W, H = height;
  // Dual chart needs wider right margin for right-axis ticks
  const MR_D = 52;
  const PW = W - ML - MR_D, PH = H - MT - MB;
  const n = labels.length;
  const groupW = PW / n;
  const barW = Math.max(5, Math.min(20, groupW * 0.38));

  const lVals = leftSeries.data.filter((v): v is number => v != null);
  const rVals = rightSeries.data.filter((v): v is number => v != null);
  const { min: lMin, max: lMax, ticks: lTicks } = niceAxis(lVals);
  const { min: rMin, max: rMax, ticks: rTicks } = niceAxis(rVals);
  const lRange = lMax - lMin || 1, rRange = rMax - rMin || 1;
  const toYL = (v: number) => MT + PH - ((v - lMin) / lRange) * PH;
  const toYR = (v: number) => MT + PH - ((v - rMin) / rRange) * PH;

  const legendItemW = 95;
  const legendTotalW = 2 * legendItemW;
  const legendStartX = (W - legendTotalW) / 2;

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Plot area background */}
        <rect x={ML} y={MT} width={PW} height={PH} style={{ fill: "var(--bg-hover)" }} opacity={0.25} rx={2} />

        {/* Left grid + ticks */}
        {lTicks.map((t, i) => {
          const y = toYL(t);
          return (
            <g key={i}>
              <line x1={ML} x2={ML + PW} y1={y} y2={y} style={{ stroke: "var(--card-border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 8} y={y + 4} textAnchor="end" fontSize={8} style={{ fill: "var(--t3)" }}>
                {Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Left Y unit */}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} style={{ fill: leftSeries.color }} fontWeight="700">{leftSeries.unit}</text>
        {/* Right Y unit */}
        <text x={ML + PW + 8} y={MT - 10} textAnchor="start" fontSize={7.5} style={{ fill: rightSeries.color }} fontWeight="700">{rightSeries.unit}</text>

        {/* Right ticks */}
        {rTicks.map((t, i) => (
          <text key={i} x={ML + PW + 8} y={toYR(t) + 4} textAnchor="start" fontSize={8} style={{ fill: "var(--t3)" }}>
            {Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2)}
          </text>
        ))}

        {/* Axis borders */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />
        <line x1={ML} x2={ML + PW} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />
        <line x1={ML + PW} x2={ML + PW} y1={MT} y2={MT + PH} style={{ stroke: "var(--card-border)" }} strokeWidth={1} />

        {/* Zero baseline */}
        <line x1={ML} x2={ML + PW} y1={toYL(0)} y2={toYL(0)} style={{ stroke: "var(--t3)" }} strokeWidth={0.8} opacity={0.5} />

        {labels.map((lbl, gi) => {
          const cx = ML + gi * groupW + groupW / 2;
          const isH = hover?.idx === gi;
          return (
            <g key={lbl}>
              {isH && <rect x={ML + gi * groupW + 1} y={MT + 1} width={groupW - 2} height={PH - 1} style={{ fill: "var(--bg-hover)" }} opacity={0.6} rx={2} />}
              {/* Left bar */}
              {leftSeries.data[gi] != null && (() => {
                const v = leftSeries.data[gi]!;
                const by = toYL(Math.max(0, v)), by0 = toYL(Math.min(0, v));
                return (
                  <rect x={cx - barW - 1.5} y={Math.min(by, by0)} width={barW} height={Math.max(2, Math.abs(by0 - by))} rx={2}
                    style={{ fill: leftSeries.color }} opacity={hover && !isH ? 0.25 : 0.9} />
                );
              })()}
              {/* Right bar */}
              {rightSeries.data[gi] != null && (() => {
                const v = rightSeries.data[gi]!;
                const col = v >= 0 ? rightSeries.color : rightSeries.negColor;
                const by = toYR(Math.max(0, v)), by0 = toYR(Math.min(0, v));
                return (
                  <rect x={cx + 1.5} y={Math.min(by, by0)} width={barW} height={Math.max(2, Math.abs(by0 - by))} rx={2}
                    style={{ fill: col }} opacity={hover && !isH ? 0.25 : 0.9} />
                );
              })()}
              <rect x={ML + gi * groupW} y={MT} width={groupW} height={PH} fill="transparent" style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHover({ idx: gi, pctX: (gi + 0.5) / n })} />
              <text x={cx} y={H - MB + 18} textAnchor="middle" fontSize={8} style={{ fill: "var(--t3)" }}>{lbl}</text>
            </g>
          );
        })}

        {/* Centered legend */}
        {[leftSeries, rightSeries].map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <rect x={0} y={1} width={9} height={9} rx={2} style={{ fill: s.color }} opacity={0.9} />
            <text x={13} y={9} fontSize={7.5} style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
          </g>
        ))}
      </svg>

      {hover && (
        <Tooltip hover={hover} labels={labels} items={[
          { name: leftSeries.name, color: leftSeries.color, value: leftSeries.data[hover.idx] != null ? `${leftSeries.data[hover.idx]!.toFixed(2)} ${leftSeries.unit}` : "—" },
          { name: rightSeries.name, color: rightSeries.color, value: rightSeries.data[hover.idx] != null ? `${rightSeries.data[hover.idx]!.toFixed(2)} ${rightSeries.unit}` : "—" },
        ]} />
      )}
    </div>
  );
}

/* ─── HoldersSection ─── */
function HoldersSection({ data, loading }: { data: HoldersData | undefined; loading: boolean }) {
  if (loading) return (
    <div style={{ border: "1px solid var(--card-border)", background: "var(--bg-card)", borderRadius: "var(--r-xl)", padding: 20 }}>
      <SkeletonChart height={200} />
    </div>
  );
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Major summary */}
      {data.major_summary && data.major_summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.major_summary.map((m, i) => (
            <div key={i} style={{
              padding: "14px 16px", border: "1px solid var(--card-border)",
              borderTop: "1px solid var(--card-border)",
              background: "var(--bg-card)", borderRadius: "var(--r-xl)",
              boxShadow: "var(--card-shadow)",
            }}>
              <div style={{ color: "var(--t3)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                {m.label}
              </div>
              <div style={{ color: "var(--t1)", fontSize: "1.1rem", fontWeight: 600 }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HolderTable title="Top Institutional Holders" rows={data.institutional}
          cols={[
            { key: "Holder",  label: "Holder" },
            { key: "pctHeld", label: "% Held", num: true, fmt: v => v != null ? `${(Number(v) * 100).toFixed(2)}%` : "—" },
            { key: "Shares",  label: "Shares",  num: true, fmt: v => v != null ? fmtBig(Number(v)) : "—" },
            { key: "Value",   label: "Value",   num: true, fmt: v => v != null ? `$${fmtBig(Number(v))}` : "—" },
          ]}
        />
        <HolderTable title="Top Mutual Funds" rows={data.mutualfunds}
          cols={[
            { key: "Holder",  label: "Fund" },
            { key: "pctHeld", label: "% Held", num: true, fmt: v => v != null ? `${(Number(v) * 100).toFixed(2)}%` : "—" },
            { key: "Shares",  label: "Shares",  num: true, fmt: v => v != null ? fmtBig(Number(v)) : "—" },
            { key: "Value",   label: "Value",   num: true, fmt: v => v != null ? `$${fmtBig(Number(v))}` : "—" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HolderTable
          title="Insider Transactions"
          rows={data.insider_transactions as unknown as Record<string, unknown>[]}
          emptyHint="No recent insider transactions."
          cols={[
            { key: "Start Date",   label: "Date" },
            { key: "Insider",      label: "Name" },
            { key: "Position",     label: "Role" },
            { key: "Transaction",  label: "Type" },
            { key: "Shares",       label: "Shares", num: true, fmt: v => v != null ? fmtBig(Number(v)) : "—" },
            { key: "Value",        label: "Value",  num: true, fmt: v => v != null ? `$${fmtBig(Number(v))}` : "—" },
          ]}
        />
        <HolderTable
          title="Insider Roster"
          rows={data.insider_roster as unknown as Record<string, unknown>[]}
          emptyHint="No roster data."
          cols={[
            { key: "Name",                    label: "Name" },
            { key: "Position",                label: "Role" },
            { key: "Most Recent Transaction", label: "Last Tx" },
            { key: "Latest Transaction Date", label: "Date" },
            { key: "Shares Owned Directly",   label: "Shares", num: true, fmt: v => v != null ? fmtBig(Number(v)) : "—" },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── HolderTable ─── */
function HolderTable({
  title, rows, cols, emptyHint,
}: {
  title: string;
  rows: Record<string, unknown>[] | undefined;
  cols: HolderColDef[];
  emptyHint?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--card-border)",
      borderRadius: "var(--r-xl)", overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--card-border)",
        fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--t3)",
      }}>
        {title}
      </div>
      {!rows || rows.length === 0 ? (
        <div style={{ padding: "24px 16px", color: "var(--t3)", fontSize: "0.78rem" }}>
          {emptyHint ?? "No data."}
        </div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="terminal-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} style={{ textAlign: c.num ? "right" : "left" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => {
                    const raw = r[c.key];
                    return (
                      <td key={c.key} className={c.num ? "num" : undefined}>
                        {c.fmt ? c.fmt(raw) : (raw == null ? "—" : String(raw))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── PeerComparison ──────────────────────────────────────────────────────── */
const PEER_METRICS: { key: string; label: string; fmt: (v: unknown) => string; toneKey?: string }[] = [
  { key: "currentPrice",       label: "Price",           fmt: v => v != null ? `$${Number(v).toFixed(2)}` : "—" },
  { key: "marketCap",          label: "Market Cap",      fmt: v => v != null ? formatLargeNumber(v as number) : "—" },
  { key: "trailingPE",         label: "Trailing P/E",    fmt: v => v != null ? formatNumber(v as number, 2) : "—", toneKey: "trailingPE" },
  { key: "forwardPE",          label: "Forward P/E",     fmt: v => v != null ? formatNumber(v as number, 2) : "—", toneKey: "forwardPE" },
  { key: "pegRatio",           label: "PEG Ratio",       fmt: v => v != null ? formatNumber(v as number, 2) : "—", toneKey: "pegRatio" },
  { key: "priceToBook",        label: "P / Book",        fmt: v => v != null ? formatNumber(v as number, 2) : "—", toneKey: "priceToBook" },
  { key: "returnOnEquity",     label: "ROE",             fmt: v => v != null ? formatPercent(v as number) : "—",   toneKey: "returnOnEquity" },
  { key: "returnOnAssets",     label: "ROA",             fmt: v => v != null ? formatPercent(v as number) : "—",   toneKey: "returnOnAssets" },
  { key: "grossMargins",       label: "Gross Margin",    fmt: v => v != null ? formatPercent(v as number) : "—",   toneKey: "grossMargins" },
  { key: "operatingMargins",   label: "Op. Margin",      fmt: v => v != null ? formatPercent(v as number) : "—",   toneKey: "operatingMargins" },
  { key: "profitMargins",      label: "Net Margin",      fmt: v => v != null ? formatPercent(v as number) : "—",   toneKey: "profitMargins" },
  { key: "beta",               label: "Beta",            fmt: v => v != null ? formatNumber(v as number, 2) : "—", toneKey: "beta" },
  { key: "dividendYield",      label: "Div. Yield",      fmt: v => v != null ? formatPercent(v as number) : "—" },
  { key: "earningsGrowth",     label: "Earnings Growth", fmt: v => v != null ? formatPercent(v as number) : "—" },
  { key: "revenueGrowth",      label: "Revenue Growth",  fmt: v => v != null ? formatPercent(v as number) : "—" },
  { key: "debtToEquity",       label: "Debt / Equity",   fmt: v => v != null ? formatNumber(v as number, 2) : "—", toneKey: "debtToEquity" },
];

function PeerComparison({
  mainTicker, peerTickers, setPeerTickers, peerInput, setPeerInput,
}: {
  mainTicker:      string;
  peerTickers:     string[];
  setPeerTickers:  (t: string[]) => void;
  peerInput:       string;
  setPeerInput:    (v: string) => void;
}) {
  const allTickers = [mainTicker, ...peerTickers];

  // Fetch fundamentals for all tickers in parallel
  const queries = allTickers.map(t =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery<EquityFundamentals>({
      queryKey: ["equity-fundamentals", t],
      queryFn:  () => get(`/equity/${encodeURIComponent(t)}/fundamentals`),
      enabled:  !!t,
      staleTime: 3_600_000,
    })
  );

  function addPeer() {
    const t = peerInput.trim().toUpperCase();
    if (!t || allTickers.includes(t)) { setPeerInput(""); return; }
    setPeerTickers([...peerTickers, t]);
    setPeerInput("");
  }

  function removePeer(t: string) {
    setPeerTickers(peerTickers.filter(p => p !== t));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Add peers ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={peerInput}
            onChange={e => setPeerInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") addPeer(); }}
            placeholder="Add peer (e.g. AMD)"
            maxLength={10}
            style={{
              background: "var(--bg-hover)", border: "1px solid var(--card-border)",
              borderRadius: "var(--r-sm)", padding: "7px 12px",
              fontSize: "0.78rem", color: "var(--t1)", outline: "none",
              width: 160,
            }}
          />
          <button
            onClick={addPeer}
            style={{
              background: "var(--orange)", border: "none", cursor: "pointer",
              padding: "7px 12px", borderRadius: "var(--r-sm)",
              display: "flex", alignItems: "center",
            }}
          >
            <Plus size={13} color="#fff" />
          </button>
        </div>
        {peerTickers.map(t => (
          <span
            key={t}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: "var(--r-sm)",
              background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
              fontSize: "0.75rem", color: "var(--orange)",
            }}
          >
            {t}
            <button onClick={() => removePeer(t)} style={{ color: "rgba(245,245,245,0.4)", lineHeight: 0, cursor: "pointer", background: "none", border: "none" }}>
              <XIcon size={10} />
            </button>
          </span>
        ))}
        {peerTickers.length === 0 && (
          <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>
            Add tickers to compare (e.g. AMD, INTC, MSFT)
          </span>
        )}
      </div>

      {/* ── Comparison table ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr>
              <th style={{
                textAlign: "left", padding: "10px 14px",
                background: "var(--bg-card)", borderBottom: "1px solid var(--card-border)",
                fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--t3)", whiteSpace: "nowrap",
              }}>
                Metric
              </th>
              {allTickers.map((t, idx) => {
                const q = queries[idx];
                const fund = q.data;
                return (
                  <th
                    key={t}
                    style={{
                      textAlign: "right", padding: "10px 14px",
                      background: idx === 0 ? "var(--orange-dim)" : "var(--bg-card)",
                      borderBottom: "1px solid var(--card-border)",
                      borderLeft: "1px solid var(--card-border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: idx === 0 ? "var(--orange)" : "var(--t1)" }}>
                      {t}
                    </div>
                    {fund && (
                      <div style={{ fontSize: "0.6rem", color: "var(--t3)", fontWeight: 400, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(fund.longName ?? "")}
                      </div>
                    )}
                    {q.isLoading && (
                      <div style={{ fontSize: "0.6rem", color: "var(--t3)" }}>Loading…</div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PEER_METRICS.map(({ key, label, fmt, toneKey }, ri) => (
              <tr
                key={key}
                style={{ background: ri % 2 === 1 ? "var(--bg-hover)" : "transparent" }}
              >
                <td style={{
                  padding: "8px 14px", borderBottom: "1px solid var(--card-border)",
                  color: "var(--t2)", fontSize: "0.78rem", whiteSpace: "nowrap",
                }}>
                  {METRIC_TIPS[label]
                    ? <MetricTooltip label={label} tip={METRIC_TIPS[label]} />
                    : label
                  }
                </td>
                {allTickers.map((t, idx) => {
                  const q = queries[idx];
                  const raw = q.data ? (q.data as Record<string, unknown>)[key] : undefined;
                  const rawNum = raw != null ? Number(raw) : undefined;
                  const tone = toneKey ? getMetricTone(toneKey, rawNum) : undefined;
                  const toneColor = tone === "pos" ? "var(--green)" : tone === "warn" ? "var(--yellow, #c9b178)" : tone === "neg" ? "var(--red)" : "var(--t1)";
                  return (
                    <td
                      key={t}
                      style={{
                        textAlign: "right", padding: "8px 14px",
                        borderBottom: "1px solid var(--card-border)",
                        borderLeft: "1px solid var(--card-border)",
                        
                        fontSize: "0.78rem",
                        fontWeight: idx === 0 ? 600 : 400,
                        color: toneColor,
                        background: idx === 0 ? "rgba(122,167,232,0.03)" : "transparent",
                      }}
                    >
                      {q.isLoading ? "…" : fmt(raw)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
