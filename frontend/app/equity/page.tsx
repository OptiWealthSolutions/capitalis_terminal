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
import { LoadingSpinner, SkeletonBlock, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  formatNumber, formatPercent, formatCurrency, formatLargeNumber,
} from "@/lib/utils";
import { Search, TrendingUp, BarChart2, LineChart, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
type Period = typeof PERIODS[number];
type FinView = "annual" | "quarterly";
type Tab = "overview" | "financials" | "charts" | "ownership";

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
  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: "overview",   label: t.equity.tabs.overview,   Icon: TrendingUp },
    { id: "financials", label: t.equity.tabs.financials, Icon: BarChart2  },
    { id: "charts",     label: t.equity.tabs.charts,     Icon: LineChart  },
    { id: "ownership",  label: t.equity.tabs.ownership,  Icon: Users      },
  ];

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
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto fade-in" style={{ display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>{t.equity.title}</h1>
          <div style={{ position: "relative" }}>
            <div style={{
              display: "flex", border: "1px solid var(--border)",
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
                background: "var(--bg-card)", border: "1px solid var(--border)",
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
                      borderBottom: "1px solid var(--border)",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
                  >
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--orange)", fontSize: "0.78rem", minWidth: 60 }}>{s.ticker}</span>
                    <span style={{ color: "var(--t2)", fontSize: "0.75rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ color: "var(--t3)", fontSize: "0.65rem", flexShrink: 0 }}>{s.exchange}</span>
                  </button>
                ))}
              </div>
            )}
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
          <div style={{ marginBottom: 2 }}><SkeletonBlock className="h-16" /></div>
        ) : fund ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 16, padding: "14px 20px",
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderLeft: "3px solid var(--orange)", borderRadius: "var(--r-sm)",
          }}>
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem",
              fontWeight: 700, color: "var(--orange)",
            }}>
              {ticker}
            </span>
            <div>
              <div style={{ fontSize: "0.84rem", fontWeight: 500, color: "var(--t1)" }}>
                {String(fund.longName ?? "")}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--t3)", marginTop: 2 }}>
                {String(fund.sector ?? "")} · {String(fund.industry ?? "")}
              </div>
            </div>
            {currentPrice != null && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{
                  fontSize: "1.35rem", fontWeight: 700,
                  color: "var(--t1)", fontFamily: "JetBrains Mono, monospace",
                }}>
                  {formatCurrency(currentPrice, (fund.currency as string) ?? "USD")}
                </span>
                {dayChange !== null && dayChangePct !== null && (
                  <span style={{
                    fontSize: "0.88rem", fontWeight: 600,
                    color: dayChange >= 0 ? "var(--green)" : "var(--red)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}>
                    {dayChange >= 0 ? "+" : ""}{formatNumber(dayChange, 2)}{" "}
                    <span style={{ opacity: 0.7 }}>
                      ({dayChangePct >= 0 ? "+" : ""}{formatPercent(dayChangePct)})
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* ── Tab bar ── */}
        <div style={{
          display: "flex", borderBottom: "1px solid var(--border)",
          marginBottom: 24, marginTop: 4, overflowX: "auto",
        }}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 20px", background: "none", border: "none",
                borderBottom: `2px solid ${tab === id ? "var(--orange)" : "transparent"}`,
                marginBottom: -1, cursor: "pointer",
                color: tab === id ? "var(--orange)" : "var(--t2)",
                fontSize: "0.8rem", fontWeight: tab === id ? 600 : 400,
                letterSpacing: "0.01em", transition: "all 0.12s",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ════ Tab: Overview ════ */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {stats.isLoading || fundamentals.isLoading ? (
              <div className="grid grid-cols-5 gap-3">
                {[...Array(5)].map((_, i) => <SkeletonBlock key={i} className="h-20" />)}
              </div>
            ) : (
              <>
                {/* Performance KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  <StatKPI label="Ann. Return (5Y)" value={s ? formatPercent(s.ann_return) : "—"} tone={s && s.ann_return > 0 ? "up" : "down"} />
                  <StatKPI label="Ann. Volatility"  value={s ? formatPercent(s.ann_volatility) : "—"} />
                  <StatKPI label="Sharpe Ratio"     value={s ? formatNumber(s.sharpe_ratio, 3) : "—"} tone={s && s.sharpe_ratio > 1 ? "up" : undefined} />
                  <StatKPI label="Max Drawdown"     value={s ? formatPercent(s.max_drawdown) : "—"} tone="down" />
                  <StatKPI label="CAGR (5Y)"        value={s ? formatPercent(s.cagr) : "—"} tone={s && s.cagr > 0 ? "up" : "down"} />
                </div>

                {/* Company description */}
                {(fund?.longBusinessSummary || fund?.fullTimeEmployees) && (
                  <div style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "var(--r)", padding: "16px 20px",
                  }}>
                    <div style={{
                      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "var(--t3)", marginBottom: 10,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span>About</span>
                      {fund?.fullTimeEmployees != null && (
                        <span style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--t2)", fontSize: "0.68rem", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
                          {formatLargeNumber(n(fund.fullTimeEmployees))} employees
                        </span>
                      )}
                    </div>
                    {fund?.longBusinessSummary && (
                      <p style={{
                        fontSize: "0.78rem", color: "var(--t2)", lineHeight: 1.6,
                        margin: 0, display: "-webkit-box", WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical", overflow: "hidden",
                      }}>
                        {String(fund.longBusinessSummary)}
                      </p>
                    )}
                  </div>
                )}

                {/* Analyst Targets */}
                {(fund?.targetMeanPrice != null || fund?.recommendationMean != null) && (
                  <div style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderLeft: "3px solid var(--orange)", borderRadius: "var(--r)", overflow: "hidden",
                  }}>
                    <div style={{
                      padding: "11px 16px", borderBottom: "1px solid var(--border)",
                      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "var(--t3)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span>Analyst Consensus</span>
                      {fund?.numberOfAnalystOpinions != null && (
                        <span style={{ fontWeight: 500, color: "var(--t2)", fontSize: "0.68rem", textTransform: "none", letterSpacing: 0 }}>
                          {String(fund.numberOfAnalystOpinions)} analysts
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {[
                        ["Mean Target",   fund?.targetMeanPrice   != null ? formatCurrency(n(fund.targetMeanPrice)!,   (fund.currency as string) ?? "USD") : "—"],
                        ["High Target",   fund?.targetHighPrice   != null ? formatCurrency(n(fund.targetHighPrice)!,   (fund.currency as string) ?? "USD") : "—"],
                        ["Low Target",    fund?.targetLowPrice    != null ? formatCurrency(n(fund.targetLowPrice)!,    (fund.currency as string) ?? "USD") : "—"],
                        ["Median Target", fund?.targetMedianPrice != null ? formatCurrency(n(fund.targetMedianPrice)!, (fund.currency as string) ?? "USD") : "—"],
                        ["Rec. Score",    fund?.recommendationMean != null ? `${formatNumber(n(fund.recommendationMean), 2)} / 5` : "—"],
                      ].map(([label, value], i) => (
                        <div key={label} style={{
                          flex: "1 1 160px", padding: "12px 16px",
                          borderRight: i < 4 ? "1px solid var(--border)" : "none",
                          borderBottom: "none",
                        }}>
                          <div style={{ fontSize: "0.6rem", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
                          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.92rem", fontWeight: 600, color: "var(--t1)" }}>{value}</div>
                          {label === "Mean Target" && currentPrice != null && fund?.targetMeanPrice != null && (
                            <div style={{
                              fontSize: "0.65rem", marginTop: 3,
                              color: (n(fund.targetMeanPrice)! > currentPrice) ? "var(--green)" : "var(--red)",
                              fontFamily: "JetBrains Mono, monospace",
                            }}>
                              {((n(fund.targetMeanPrice)! - currentPrice) / currentPrice * 100).toFixed(1)}% upside
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3-column: Valuation | Profitability | Trading Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FundSection title="Valuation" rows={[
                    ["Market Cap",        formatLargeNumber(n(fund?.marketCap))],
                    ["Enterprise Value",  formatLargeNumber(n(fund?.enterpriseValue))],
                    ["Forward P/E",       formatNumber(n(fund?.forwardPE), 2)],
                    ["Trailing P/E",      formatNumber(n(fund?.trailingPE), 2)],
                    ["Price / Book",      formatNumber(n(fund?.priceToBook), 3)],
                    ["Price / Sales",     formatNumber(n(fund?.priceToSalesTrailing12Months), 3)],
                    ["EV / EBITDA",       formatNumber(n(fund?.enterpriseToEbitda), 2)],
                    ["EV / Revenue",      formatNumber(n(fund?.enterpriseToRevenue), 2)],
                    ["PEG Ratio",         formatNumber(n(fund?.pegRatio), 3)],
                    ["Beta",              formatNumber(n(fund?.beta), 3)],
                  ]} />
                  <FundSection title="Profitability" rows={[
                    ["ROE",               formatPercent(n(fund?.returnOnEquity))],
                    ["ROA",               formatPercent(n(fund?.returnOnAssets))],
                    ["Gross Margin",      formatPercent(n(fund?.grossMargins))],
                    ["Operating Margin",  formatPercent(n(fund?.operatingMargins))],
                    ["Net Margin",        formatPercent(n(fund?.profitMargins))],
                    ["EBITDA Margin",     formatPercent(n(fund?.ebitdaMargins))],
                    ["EBITDA",            formatLargeNumber(n(fund?.ebitda))],
                    ["Operating CF",      formatLargeNumber(n(fund?.operatingCashflow))],
                  ]} />
                  <FundSection title="Trading Info" rows={[
                    ["Volume",            n(fund?.volume) != null ? formatLargeNumber(n(fund.volume)) : "—"],
                    ["Avg Volume",        n(fund?.averageVolume) != null ? formatLargeNumber(n(fund.averageVolume)) : "—"],
                    ["Avg Vol (10D)",     n(fund?.averageVolume10days) != null ? formatLargeNumber(n(fund.averageVolume10days)) : "—"],
                    ["52W High",          fund?.fiftyTwoWeekHigh != null ? formatCurrency(n(fund.fiftyTwoWeekHigh)!, (fund.currency as string) ?? "USD") : "—"],
                    ["52W Low",           fund?.fiftyTwoWeekLow  != null ? formatCurrency(n(fund.fiftyTwoWeekLow)!,  (fund.currency as string) ?? "USD") : "—"],
                    ["Day High",          fund?.dayHigh != null ? formatCurrency(n(fund.dayHigh)!, (fund.currency as string) ?? "USD") : "—"],
                    ["Day Low",           fund?.dayLow  != null ? formatCurrency(n(fund.dayLow)!,  (fund.currency as string) ?? "USD") : "—"],
                    ["50D Avg",           fund?.fiftyDayAverage  != null ? formatCurrency(n(fund.fiftyDayAverage)!,  (fund.currency as string) ?? "USD") : "—"],
                    ["200D Avg",          fund?.twoHundredDayAverage != null ? formatCurrency(n(fund.twoHundredDayAverage)!, (fund.currency as string) ?? "USD") : "—"],
                  ]} />
                </div>

                {/* 3-column: Per Share | Growth | Financial Health */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FundSection title="Per Share" rows={[
                    ["EPS (TTM)",         fund?.trailingEps != null ? formatCurrency(n(fund.trailingEps)!, (fund.currency as string) ?? "USD") : "—"],
                    ["EPS (Forward)",     fund?.forwardEps  != null ? formatCurrency(n(fund.forwardEps)!,  (fund.currency as string) ?? "USD") : "—"],
                    ["Revenue / Share",   fund?.revenuePerShare != null ? formatCurrency(n(fund.revenuePerShare)!, (fund.currency as string) ?? "USD") : "—"],
                    ["Book Value",        fund?.bookValue != null ? formatCurrency(n(fund.bookValue)!, (fund.currency as string) ?? "USD") : "—"],
                    ["Dividend / Share",  fund?.dividendRate != null ? formatCurrency(n(fund.dividendRate)!, (fund.currency as string) ?? "USD") : "—"],
                    ["Dividend Yield",    formatPercent(n(fund?.dividendYield))],
                    ["Payout Ratio",      formatPercent(n(fund?.payoutRatio))],
                    ["Ex-Div Date",       fund?.exDividendDate ? String(fund.exDividendDate) : "—"],
                  ]} />
                  <FundSection title="Growth" rows={[
                    ["Earnings Growth",   formatPercent(n(fund?.earningsGrowth))],
                    ["Revenue Growth",    formatPercent(n(fund?.revenueGrowth))],
                    ["Total Revenue",     formatLargeNumber(n(fund?.totalRevenue))],
                    ["Free Cash Flow",    formatLargeNumber(n(fund?.freeCashflow))],
                    ["Net Income",        formatLargeNumber(n(fund?.netIncomeToCommon))],
                  ]} />
                  <FundSection title="Financial Health" rows={[
                    ["Total Cash",        formatLargeNumber(n(fund?.totalCash))],
                    ["Total Debt",        formatLargeNumber(n(fund?.totalDebt))],
                    ["Current Ratio",     formatNumber(n(fund?.currentRatio), 2)],
                    ["Quick Ratio",       formatNumber(n(fund?.quickRatio), 2)],
                    ["Debt / Equity",     formatNumber(n(fund?.debtToEquity), 2)],
                    ["Float Shares",      formatLargeNumber(n(fund?.floatShares))],
                    ["Shares Out.",       formatLargeNumber(n(fund?.sharesOutstanding))],
                    ["Inst. Held",        formatPercent(n(fund?.heldPercentInstitutions))],
                    ["Insider Held",      formatPercent(n(fund?.heldPercentInsiders))],
                    ["Short Float",       formatPercent(n(fund?.shortPercentOfFloat))],
                  ]} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ Tab: Financials ════ */}
        {tab === "financials" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{
                display: "flex", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", overflow: "hidden",
              }}>
                {(["annual", "quarterly"] as FinView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setFinView(v)}
                    style={{
                      padding: "6px 18px", fontSize: "0.7rem", fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      background: finView === v ? "var(--orange)" : "var(--bg-card)",
                      color: finView === v ? "#fff" : "var(--t2)",
                      border: "none", cursor: "pointer", transition: "all 0.12s",
                    }}
                  >
                    {v === "annual" ? t.equity.period.annual : t.equity.period.quarterly}
                  </button>
                ))}
              </div>
            </div>
            {financials.isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <SkeletonChart height={200} />
                <SkeletonChart height={180} />
                <SkeletonChart height={180} />
              </div>
            ) : financials.error ? (
              <QueryError error={financials.error as Error} onRetry={() => financials.refetch()} />
            ) : financials.data ? (
              <FinancialCharts data={financials.data[finView]} view={finView} />
            ) : null}
          </div>
        )}

        {/* ════ Tab: Charts ════ */}
        {tab === "charts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Key indicators block */}
            {fund && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 0, border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden",
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
                            <span style={{ fontSize: "0.65rem", color: "var(--t3)", fontFamily: "JetBrains Mono, monospace" }}>{formatCurrency(lo, curr)}</span>
                            <span style={{ fontSize: "0.65rem", color: "var(--t3)", fontFamily: "JetBrains Mono, monospace" }}>{formatCurrency(hi, curr)}</span>
                          </div>
                          <div style={{ height: 4, background: "var(--bg-hover)", borderRadius: 2, position: "relative" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: `linear-gradient(90deg, var(--red), var(--green))`, borderRadius: 2 }} />
                            <div style={{ position: "absolute", top: -3, left: `calc(${pct * 100}% - 4px)`, width: 8, height: 10, background: "var(--orange)", borderRadius: 2 }} />
                          </div>
                          <div style={{ textAlign: "center", marginTop: 5, fontSize: "0.7rem", fontFamily: "JetBrains Mono, monospace", color: "var(--t1)", fontWeight: 600 }}>
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
                    borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 8 }}>
                      {item.label}
                    </div>
                    {item.custom ?? (
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.9rem", fontWeight: 600, color: (item as { color?: string }).color ?? "var(--t1)" }}>
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
                    border: `1px solid ${period === p ? "var(--orange)" : "var(--border)"}`,
                    borderRadius: "var(--r-sm)", cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{
              border: "1px solid var(--border)", borderRadius: "var(--r)",
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
                  height={340}
                />
              ) : null}
            </div>
          </div>
        )}

        {/* ════ Tab: Ownership ════ */}
        {tab === "ownership" && (
          <HoldersSection data={holders.data} loading={holders.isLoading} />
        )}
      </div>
    </ErrorBoundary>
  );
}

/* ─── StatKPI ─── */
function StatKPI({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const col = tone === "up" ? "var(--green)" : tone === "down" ? "var(--red)" : "var(--t1)";
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderTop: "1px solid var(--border-hi)", borderRadius: "var(--r)",
      padding: "16px 18px", boxShadow: "var(--card-shadow)",
    }}>
      <div style={{
        fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--t3)", marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "JetBrains Mono, monospace", fontSize: "1.25rem",
        fontWeight: 700, color: col, letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
    </div>
  );
}

/* ─── FundSection ─── */
function FundSection({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "var(--r)", overflow: "hidden",
    }}>
      <div style={{
        padding: "11px 16px", borderBottom: "1px solid var(--border)",
        fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--t3)",
      }}>
        {title}
      </div>
      <div>
        {rows.map(([label, value], i) => (
          <div
            key={label}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 16px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
              background: i % 2 === 1 ? "var(--bg-hover)" : "transparent",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: "var(--t2)" }}>{label}</span>
            <span style={{
              fontSize: "0.78rem", fontFamily: "JetBrains Mono, monospace",
              fontWeight: 500, color: "var(--t1)",
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── FinancialCharts ─── */
function FinancialCharts({ data, view }: { data: FinancialPeriod; view: FinView }) {
  if (!data?.dates?.length) {
    return (
      <div style={{
        padding: 24, border: "1px solid var(--border)", background: "var(--bg-card)",
        borderRadius: "var(--r)", color: "var(--t3)", fontSize: "0.8rem",
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
      border: "1px solid var(--border)",
      borderTop: "2px solid var(--orange)",
      borderRadius: "var(--r)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px",
        borderBottom: "1px solid var(--border)",
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
        border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden",
        background: "var(--bg-card)",
      }}>
        {kpis.map((k, i) => (
          <div key={k.label} style={{
            padding: "12px 14px",
            borderRight: i < kpis.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <div style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.88rem", fontWeight: 600, color: k.color ?? "var(--t1)" }}>{k.value}</div>
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
          if (i === 0 || v == null || data.revenue![i - 1] == null || data.revenue![i - 1] === 0) return null;
          return +((v / data.revenue![i - 1]! - 1) * 100).toFixed(2);
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
              <line x1={ML} x2={W - MR} y1={y} y2={y} style={{ stroke: "var(--border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 6} y={y + 3.5} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>
                {t.toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--orange)" }} fontWeight="700">{yUnit}</text>
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />

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
          <text key={i} x={toX(i)} y={H - MB + 14} textAnchor="middle" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>{lbl}</text>
        ))}

        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <line x1={0} y1={5} x2={12} y2={5} style={{ stroke: s.color }} strokeWidth={2} />
            <circle cx={6} cy={5} r={3} style={{ fill: s.color, stroke: "var(--bg-card)" }} strokeWidth={1.5} />
            <text x={17} y={9} fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
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
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 11,
      fontFamily: "JetBrains Mono, monospace",
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
              <line x1={ML} x2={W - MR} y1={y} y2={y} style={{ stroke: "var(--border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 6} y={y + 3.5} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>
                {Math.abs(t) >= 100 ? t.toFixed(0) : Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Y unit label */}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--orange)" }} fontWeight="700">{yUnit}</text>

        {/* Axis borders */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />

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
              <text x={ML + gi * groupW + groupW / 2} y={H - MB + 14} textAnchor="middle" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>{lbl}</text>
            </g>
          );
        })}

        {/* Centered legend */}
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <rect x={0} y={1} width={9} height={9} rx={2} style={{ fill: s.color }} opacity={0.9} />
            <text x={13} y={9} fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
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
              <line x1={ML} x2={W - MR} y1={y} y2={y} style={{ stroke: "var(--border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 6} y={y + 3.5} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>
                {t.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Y unit label */}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--orange)" }} fontWeight="700">{yUnit}</text>

        {/* Axis borders */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />

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
          <text key={i} x={toX(i)} y={H - MB + 14} textAnchor="middle" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>{lbl}</text>
        ))}

        {/* Centered legend (line + dot style) */}
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <line x1={0} y1={5} x2={12} y2={5} style={{ stroke: s.color }} strokeWidth={2} />
            <circle cx={6} cy={5} r={3} style={{ fill: s.color, stroke: "var(--bg-card)" }} strokeWidth={1.5} />
            <text x={17} y={9} fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
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
              <line x1={ML} x2={ML + PW} y1={y} y2={y} style={{ stroke: "var(--border)" }} strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={ML - 8} y={y + 4} textAnchor="end" fontSize={8}fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>
                {Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Left Y unit */}
        <text x={ML - 8} y={MT - 10} textAnchor="end" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: leftSeries.color }} fontWeight="700">{leftSeries.unit}</text>
        {/* Right Y unit */}
        <text x={ML + PW + 8} y={MT - 10} textAnchor="start" fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: rightSeries.color }} fontWeight="700">{rightSeries.unit}</text>

        {/* Right ticks */}
        {rTicks.map((t, i) => (
          <text key={i} x={ML + PW + 8} y={toYR(t) + 4} textAnchor="start" fontSize={8}fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>
            {Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2)}
          </text>
        ))}

        {/* Axis borders */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />
        <line x1={ML} x2={ML + PW} y1={MT + PH} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />
        <line x1={ML + PW} x2={ML + PW} y1={MT} y2={MT + PH} style={{ stroke: "var(--border)" }} strokeWidth={1} />

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
              <text x={cx} y={H - MB + 18} textAnchor="middle" fontSize={8}fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t3)" }}>{lbl}</text>
            </g>
          );
        })}

        {/* Centered legend */}
        {[leftSeries, rightSeries].map((s, i) => (
          <g key={s.name} transform={`translate(${legendStartX + i * legendItemW}, ${MT - 18})`}>
            <rect x={0} y={1} width={9} height={9} rx={2} style={{ fill: s.color }} opacity={0.9} />
            <text x={13} y={9} fontSize={7.5} fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--t2)" }} fontWeight="500">{s.name}</text>
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
    <div style={{ border: "1px solid var(--border)", background: "var(--bg-card)", borderRadius: "var(--r)", padding: 20 }}>
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
              padding: "14px 16px", border: "1px solid var(--border)",
              borderTop: "1px solid var(--border-hi)",
              background: "var(--bg-card)", borderRadius: "var(--r)",
              boxShadow: "var(--card-shadow)",
            }}>
              <div style={{ color: "var(--t3)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                {m.label}
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--t1)", fontSize: "1.1rem", fontWeight: 600 }}>
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
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: "var(--r)", overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
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
