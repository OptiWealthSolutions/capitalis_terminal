"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import type { PriceHistory, EquityFundamentals, ReturnsStats, EquityFinancials, FinancialPeriod } from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import MetricCard from "@/components/ui/MetricCard";
import TVChart from "@/components/charts/TVChart";
import { LoadingSpinner, SkeletonBlock, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatNumber, formatPercent, formatCurrency, formatLargeNumber, colorForValue } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
type Period = typeof PERIODS[number];
type FinView = "annual" | "quarterly";

export default function EquityPage() {
  const [ticker, setTicker] = useState("NVDA");
  const [inputValue, setInputValue] = useState("NVDA");
  const [period, setPeriod] = useState<Period>("1y");
  const [finView, setFinView] = useState<FinView>("annual");

  const history = useQuery<PriceHistory>({
    queryKey: ["equity-history", ticker, period],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/history?period=${period}`),
    enabled: !!ticker,
    staleTime: 3600_000,
  });

  const fundamentals = useQuery<EquityFundamentals>({
    queryKey: ["equity-fundamentals", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/fundamentals`),
    enabled: !!ticker,
    staleTime: 3600_000,
  });

  const stats = useQuery<ReturnsStats>({
    queryKey: ["equity-stats", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/returns-stats`),
    enabled: !!ticker,
    staleTime: 3600_000,
  });

  const financials = useQuery<EquityFinancials>({
    queryKey: ["equity-financials", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/financials`),
    enabled: !!ticker,
    staleTime: 86400_000,
  });

  const handleSearch = () => {
    const t = inputValue.trim().toUpperCase();
    if (t) setTicker(t);
  };

  const isLoading = history.isLoading || fundamentals.isLoading || stats.isLoading;
  const isError = history.isError || fundamentals.isError;

  const fund = fundamentals.data;
  const s = stats.data;

  const currentPrice = fund?.currentPrice as number | undefined;
  const prevClose = fund?.previousClose as number | undefined;
  const dayChange = currentPrice != null && prevClose != null ? (currentPrice - prevClose) : null;
  const dayChangePct = dayChange != null && prevClose != null && prevClose !== 0 ? dayChange / prevClose : null;
  const n = (v: unknown) => v as number | undefined;

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        {/* Header + search */}
        <div className="flex items-center gap-4">
          <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase whitespace-nowrap">
            Equity Overview
          </h1>
          <div className="flex gap-2 flex-1 max-w-xs">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="TICKER..."
              className="flex-1 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-3 py-1.5 focus:outline-none focus:border-accent-blue placeholder:text-text-muted uppercase"
            />
            <button
              onClick={handleSearch}
              className="px-3 bg-accent-blue hover:bg-orange-600 transition-colors"
            >
              <Search size={13} className="text-white" />
            </button>
          </div>
          {/* Period selector */}
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-2 py-1 text-xs transition-colors border",
                  period === p
                    ? "bg-accent-blue text-white border-accent-blue"
                    : "bg-bg-tertiary text-text-secondary border-bg-border hover:border-accent-blue hover:text-text-primary"
                )}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Title band */}
        {fund && (
          <div className="flex items-baseline gap-4 px-4 py-3 bg-bg-secondary border border-bg-border border-l-4 border-l-accent-blue">
            <span className="text-accent-blue font-semibold text-base">{ticker}</span>
            <span className="text-text-secondary text-xs">{fund.longName}</span>
            <span className="text-text-muted text-xs">{fund.sector} · {fund.industry}</span>
            {currentPrice && (
              <span className="ml-auto text-text-primary text-lg font-medium">
                {formatCurrency(currentPrice, (fund.currency as string) ?? "USD")}
              </span>
            )}
            {dayChange !== null && dayChangePct !== null && (
              <span className={cn("text-sm font-medium", colorForValue(dayChange))}>
                {dayChange > 0 ? "+" : ""}{formatNumber(dayChange, 2)} ({dayChangePct > 0 ? "+" : ""}{formatPercent(dayChangePct)})
              </span>
            )}
          </div>
        )}

        {isError && (
          <QueryError
            error={(history.error ?? fundamentals.error) as Error}
            onRetry={() => {
              history.refetch();
              fundamentals.refetch();
              stats.refetch();
            }}
          />
        )}

        {/* Price chart + volume (TradingView Lightweight Charts) */}
        <div className="bg-bg-secondary border border-bg-border rounded-md overflow-hidden shadow-card">
          {history.isLoading ? (
            <SkeletonChart height={480} />
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
              height={480}
            />
          ) : null}
        </div>

        <hr className="section-divider" />

        {/* KPI grid */}
        {stats.isLoading || fundamentals.isLoading ? (
          <div className="grid grid-cols-5 gap-3">
            {[0,1,2,3,4].map((i) => <SkeletonBlock key={i} className="h-20" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-3">
              <MetricCard label="ANN. RETURN (5Y)" value={s ? formatPercent(s.ann_return) : "N/A"} accentColor={s && s.ann_return > 0 ? "green" : "red"} />
              <MetricCard label="ANN. VOLATILITY" value={s ? formatPercent(s.ann_volatility) : "N/A"} accentColor="orange" />
              <MetricCard label="SHARPE RATIO" value={s ? formatNumber(s.sharpe_ratio, 3) : "N/A"} accentColor={s && s.sharpe_ratio > 1 ? "green" : "blue"} />
              <MetricCard label="MAX DRAWDOWN" value={s ? formatPercent(s.max_drawdown) : "N/A"} accentColor="red" />
              <MetricCard label="CAGR (5Y)" value={s ? formatPercent(s.cagr) : "N/A"} accentColor={s && s.cagr > 0 ? "green" : "red"} />
            </div>

            {/* Fundamentals grid */}
            <div className="grid grid-cols-2 gap-4">
              <FundSection title="VALUATION" rows={[
                ["Market Cap", formatLargeNumber(n(fund?.marketCap))],
                ["Forward P/E", formatNumber(n(fund?.forwardPE), 2)],
                ["Trailing P/E", formatNumber(n(fund?.trailingPE), 2)],
                ["Price/Book", formatNumber(n(fund?.priceToBook), 3)],
                ["Enterprise Value", formatLargeNumber(n(fund?.enterpriseValue))],
                ["Beta", formatNumber(n(fund?.beta), 3)],
              ]} />
              <FundSection title="PROFITABILITY" rows={[
                ["ROE", formatPercent(n(fund?.returnOnEquity))],
                ["ROA", formatPercent(n(fund?.returnOnAssets))],
                ["Gross Margin", formatPercent(n(fund?.grossMargins))],
                ["Operating Margin", formatPercent(n(fund?.operatingMargins))],
                ["Net Margin", formatPercent(n(fund?.profitMargins))],
                ["Dividend Yield", formatPercent(n(fund?.dividendYield))],
              ]} />
              <FundSection title="GROWTH" rows={[
                ["Earnings Growth", formatPercent(n(fund?.earningsGrowth))],
                ["Revenue Growth", formatPercent(n(fund?.revenueGrowth))],
                ["Total Revenue", formatLargeNumber(n(fund?.totalRevenue))],
                ["Free Cash Flow", formatLargeNumber(n(fund?.freeCashflow))],
                ["Net Income", formatLargeNumber(n(fund?.netIncomeToCommon))],
              ]} />
              <FundSection title="FINANCIAL HEALTH" rows={[
                ["Current Ratio", formatNumber(n(fund?.currentRatio), 2)],
                ["Quick Ratio", formatNumber(n(fund?.quickRatio), 2)],
                ["Debt/Equity", formatNumber(n(fund?.debtToEquity), 2)],
                ["Shares Outstanding", formatLargeNumber(n(fund?.sharesOutstanding))],
                ["Insider Holding", formatPercent(n(fund?.heldPercentInsiders))],
                ["Short Float", formatPercent(n(fund?.shortPercentOfFloat))],
              ]} />
            </div>
          </>
        )}

        {/* FINANCIAL HISTORY CHARTS */}
        <hr className="section-divider" />
        <div className="flex items-center justify-between">
          <div className="text-text-secondary text-xs uppercase tracking-widest font-medium">
            FINANCIAL HISTORY
          </div>
          <div className="flex gap-1">
            {(["annual", "quarterly"] as FinView[]).map((v) => (
              <button
                key={v}
                onClick={() => setFinView(v)}
                className={cn(
                  "px-3 py-1 text-xs border transition-colors",
                  finView === v
                    ? "bg-accent-blue text-white border-accent-blue"
                    : "bg-bg-tertiary text-text-secondary border-bg-border hover:text-text-primary"
                )}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {financials.isLoading ? (
          <div className="grid grid-cols-1 gap-4">
            <SkeletonChart height={300} />
            <SkeletonChart height={280} />
            <SkeletonChart height={280} />
          </div>
        ) : financials.error ? (
          <QueryError error={financials.error as Error} onRetry={() => financials.refetch()} />
        ) : financials.data ? (
          <FinancialCharts data={financials.data[finView]} view={finView} />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

function fmtB(v: number | null): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  return v.toFixed(2);
}

function FinancialCharts({ data, view }: { data: FinancialPeriod; view: FinView }) {
  if (!data || !data.dates || data.dates.length === 0) {
    return (
      <div className="text-text-secondary text-xs p-4 bg-bg-secondary border border-bg-border">
        No financial data available.
      </div>
    );
  }

  // Format date labels: annual → year only, quarterly → Q label
  const labels = data.dates.map((d) => {
    const dt = new Date(d);
    if (view === "annual") return String(dt.getFullYear());
    const q = Math.ceil((dt.getMonth() + 1) / 3);
    return `Q${q} ${dt.getFullYear()}`;
  });

  const scaleVal = (arr: (number | null)[]) => arr.map((v) => v != null ? v / 1e9 : null);

  // Chart 1: Revenue, Gross Profit, Net Income (bars)
  const revenueChart = [
    {
      type: "bar" as const,
      name: "Revenue",
      x: labels,
      y: scaleVal(data.revenue),
      marker: { color: "#3B82F6" },
      hovertemplate: "%{x}<br>Revenue: %{customdata}<extra></extra>",
      customdata: data.revenue.map(fmtB),
    },
    {
      type: "bar" as const,
      name: "Gross Profit",
      x: labels,
      y: scaleVal(data.gross_profit),
      marker: { color: "#10B981" },
      hovertemplate: "%{x}<br>Gross Profit: %{customdata}<extra></extra>",
      customdata: data.gross_profit.map(fmtB),
    },
    {
      type: "bar" as const,
      name: "Net Income",
      x: labels,
      y: scaleVal(data.net_income),
      marker: { color: "#F5A623" },
      hovertemplate: "%{x}<br>Net Income: %{customdata}<extra></extra>",
      customdata: data.net_income.map(fmtB),
    },
  ];

  // Chart 2: Margins (lines)
  const marginsChart = [
    {
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: "Gross Margin",
      x: labels,
      y: data.gross_margin,
      line: { color: "#10B981", width: 2 },
      marker: { size: 5 },
      hovertemplate: "%{x}<br>Gross Margin: %{y:.1f}%<extra></extra>",
    },
    {
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: "Operating Margin",
      x: labels,
      y: data.operating_margin,
      line: { color: "#3B82F6", width: 2 },
      marker: { size: 5 },
      hovertemplate: "%{x}<br>Operating Margin: %{y:.1f}%<extra></extra>",
    },
    {
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: "Net Margin",
      x: labels,
      y: data.net_margin,
      line: { color: "#F5A623", width: 2 },
      marker: { size: 5 },
      hovertemplate: "%{x}<br>Net Margin: %{y:.1f}%<extra></extra>",
    },
  ];

  // Chart 3: EPS + Free Cash Flow
  const epsChart = [
    {
      type: "bar" as const,
      name: "EPS (Diluted)",
      x: labels,
      y: data.eps_diluted,
      marker: { color: "#A855F7" },
      yaxis: "y",
      hovertemplate: "%{x}<br>EPS: $%{y:.2f}<extra></extra>",
    },
    {
      type: "bar" as const,
      name: "Free Cash Flow",
      x: labels,
      y: scaleVal(data.free_cash_flow),
      marker: { color: data.free_cash_flow.map((v) => (v != null && v >= 0 ? "#2ECC40" : "#FF4136")) },
      yaxis: "y2",
      hovertemplate: "%{x}<br>FCF: %{customdata}<extra></extra>",
      customdata: data.free_cash_flow.map(fmtB),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Revenue */}
      <div>
        <div className="text-text-secondary text-xs uppercase tracking-widest font-medium mb-2">
          REVENUE / GROSS PROFIT / NET INCOME (USD B)
        </div>
        <PlotlyChart
          data={revenueChart}
          layout={{
            barmode: "group",
            height: 300,
            yaxis: { title: { text: "USD (B)" } },
          }}
          height={300}
        />
      </div>

      {/* Margins */}
      <div>
        <div className="text-text-secondary text-xs uppercase tracking-widest font-medium mb-2">
          PROFIT MARGINS (%)
        </div>
        <PlotlyChart
          data={marginsChart}
          layout={{
            height: 280,
            yaxis: { title: { text: "%" }, ticksuffix: "%" },
          }}
          height={280}
        />
      </div>

      {/* EPS + FCF */}
      <div>
        <div className="text-text-secondary text-xs uppercase tracking-widest font-medium mb-2">
          EPS (DILUTED) & FREE CASH FLOW
        </div>
        <PlotlyChart
          data={epsChart}
          layout={{
            barmode: "group",
            height: 280,
            yaxis:  { title: { text: "EPS ($)" } },
            yaxis2: {
              title: { text: "FCF (B)" },
              overlaying: "y",
              side: "right",
              showgrid: false,
            },
          }}
          height={280}
        />
      </div>
    </div>
  );
}

function FundSection({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="bg-bg-secondary border border-bg-border p-4">
      <div className="text-xs text-text-secondary uppercase tracking-widest mb-3 pb-2 border-b border-bg-border">{title}</div>
      <table className="w-full">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="text-text-secondary text-xs py-1">{label}</td>
              <td className="text-text-primary text-xs py-1 text-right font-medium">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
