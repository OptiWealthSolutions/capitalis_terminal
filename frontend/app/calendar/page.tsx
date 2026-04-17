"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LoadingSpinner, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { CalendarDays, TrendingUp, DollarSign, RefreshCw, ChevronDown, AlertTriangle, Minus, ChevronsUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EconomicEvent {
  title: string;
  country: string;
  date: string;  // ISO string e.g. "2024-04-15T13:30:00-04:00"
  impact: "High" | "Medium" | "Low" | "Holiday";
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

interface PortfolioEvent {
  ticker: string;
  type: "earnings" | "exdividend" | "dividend" | "split";
  date: string;  // YYYY-MM-DD
  // earnings fields
  eps_low?: number | null;
  eps_high?: number | null;
  eps_avg?: number | null;
  revenue_avg?: number | null;
  // dividend fields
  amount?: number | null;
  // split fields
  ratio?: number | null;
}

interface SavedPortfolio {
  id: string;
  name: string;
  tickers: string[];
  method: string;
  result: { weights: Record<string, number> } | null;
}

const STORAGE_KEY = "capitalis_portfolios_v2";

function loadPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const IMPACT_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, Holiday: 3 };

function impactColor(impact: string) {
  if (impact === "High")    return "var(--red)";
  if (impact === "Medium")  return "var(--orange)";
  if (impact === "Low")     return "var(--green)";
  return "var(--ink-3)";
}

function ImpactIcon({ impact }: { impact: string }) {
  if (impact === "High")   return <ChevronsUp size={11} style={{ color: impactColor(impact) }} />;
  if (impact === "Medium") return <AlertTriangle size={11} style={{ color: impactColor(impact) }} />;
  return <Minus size={11} style={{ color: impactColor(impact) }} />;
}

function countdownLabel(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr);
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - now.getTime()) / 86400000);
  if (diff === 0)  return "Today";
  if (diff === 1)  return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0)    return `In ${diff}d`;
  return `${Math.abs(diff)}d ago`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function groupByDate<T extends { date: string }>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of events) {
    const day = e.date.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xxs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--ink-3)" }}>{children}</div>;
}

function DayHeader({ dateStr }: { dateStr: string }) {
  const label = countdownLabel(dateStr);
  const isToday = label === "Today";
  return (
    <div className="flex items-center gap-3 py-2 mt-3 first:mt-0">
      <span className="text-xs font-semibold" style={{ color: "var(--ink)", minWidth: 120 }}>
        {formatDate(dateStr)}
      </span>
      <span
        className="text-xxs px-1.5 py-0.5 rounded font-medium"
        style={{
          background: isToday ? "var(--orange-dim)" : "var(--surface-2)",
          color: isToday ? "var(--orange)" : "var(--ink-3)",
          border: `1px solid ${isToday ? "var(--orange-border)" : "var(--border)"}`,
        }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Economic calendar tab
// ---------------------------------------------------------------------------
const CURRENCIES = ["All", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CNY", "CHF"];
const IMPACTS    = ["All", "High", "Medium", "Low"];
const WEEKS      = [
  { value: "both", label: "Both Weeks" },
  { value: "this", label: "This Week" },
  { value: "next", label: "Next Week" },
];

function EconomicTab() {
  const [currency, setCurrency] = useState("All");
  const [impact,   setImpact]   = useState("All");
  const [week,     setWeek]     = useState("both");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["calendar_economic"],
    queryFn:  () => get<{ events: EconomicEvent[] }>("/calendar/economic"),
    staleTime: 30 * 60 * 1000,
  });

  const events = useMemo(() => {
    if (!data?.events) return [];
    const now      = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const monday   = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const thisSunday = new Date(monday);
    thisSunday.setDate(monday.getDate() + 6);
    thisSunday.setHours(23, 59, 59, 999);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    nextSunday.setHours(23, 59, 59, 999);

    return data.events
      .filter((e) => {
        const d = new Date(e.date);
        const inThis = d >= monday && d <= thisSunday;
        const inNext = d >= nextMonday && d <= nextSunday;
        if (week === "this" && !inThis) return false;
        if (week === "next" && !inNext) return false;
        if (currency !== "All" && e.country !== currency) return false;
        if (impact   !== "All" && e.impact  !== impact)   return false;
        return true;
      })
      .sort((a, b) => {
        const dd = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dd !== 0) return dd;
        return (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9);
      });
  }, [data, currency, impact, week]);

  const grouped = useMemo(() => groupByDate(events.map(e => ({ ...e, date: e.date.slice(0, 10) }))), [events]);

  const highCount = events.filter(e => e.impact === "High").length;

  if (isLoading) return <SkeletonChart height={400} />;
  if (isError)   return <EmptyState message="Economic calendar unavailable." />;

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <FilterGroup label="Impact" options={IMPACTS} value={impact} onChange={setImpact} colorFn={(v) =>
          v === "High" ? "var(--red)" : v === "Medium" ? "var(--orange)" : v === "Low" ? "var(--green)" : undefined
        } />
        <div className="h-4 w-px" style={{ background: "var(--border)" }} />
        <FilterGroup label="Currency" options={CURRENCIES} value={currency} onChange={setCurrency} />
        <div className="h-4 w-px" style={{ background: "var(--border)" }} />
        <FilterGroup label="Period" options={WEEKS.map(w => w.label)} value={WEEKS.find(w => w.value === week)!.label}
          onChange={(l) => setWeek(WEEKS.find(w => w.label === l)!.value)} />
        <div className="flex-1" />
        {highCount > 0 && (
          <span className="text-xxs px-2 py-0.5 rounded font-semibold" style={{ background: "rgba(239,68,68,0.12)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.25)" }}>
            {highCount} HIGH IMPACT
          </span>
        )}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xxs px-2 py-1 rounded transition-colors"
          style={{ color: "var(--ink-3)", border: "1px solid var(--border)" }}
        >
          <RefreshCw size={10} className={isFetching ? "animate-spin" : ""} />
          REFRESH
        </button>
      </div>

      {events.length === 0 ? (
        <EmptyState message="No events match filters." />
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xxs font-semibold uppercase tracking-widest"
            style={{ background: "var(--surface-2)", color: "var(--ink-3)", borderBottom: "1px solid var(--border)" }}>
            <div className="col-span-1">Impact</div>
            <div className="col-span-1">Curr.</div>
            <div className="col-span-1">Time</div>
            <div className="col-span-5">Event</div>
            <div className="col-span-2 text-right">Forecast</div>
            <div className="col-span-2 text-right">Previous</div>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {[...grouped.entries()].map(([day, dayEvents]) => (
              <div key={day}>
                {/* Day separator */}
                <div className="px-4 py-1.5 text-xxs font-semibold flex items-center gap-2"
                  style={{ background: "var(--surface)", color: "var(--ink-2)" }}>
                  <CalendarDays size={10} />
                  {formatDate(day)}
                  <span className="text-xxs" style={{ color: "var(--ink-3)" }}>{countdownLabel(day)}</span>
                </div>
                {dayEvents.map((e, i) => (
                  <EconomicRow key={i} event={e} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EconomicRow({ event: e }: { event: EconomicEvent }) {
  const time = (() => {
    try { return new Date(e.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }); }
    catch { return "—"; }
  })();
  const hasActual = e.actual && e.actual !== "";

  return (
    <div
      className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-bg-hover"
      style={{ borderLeft: `2px solid ${impactColor(e.impact)}` }}
    >
      <div className="col-span-1 flex items-center gap-1">
        <ImpactIcon impact={e.impact} />
        <span className="text-xxs font-medium" style={{ color: impactColor(e.impact) }}>
          {e.impact === "Holiday" ? "HOL" : e.impact.slice(0, 3).toUpperCase()}
        </span>
      </div>
      <div className="col-span-1">
        <span className="text-xxs font-bold px-1 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
          {e.country}
        </span>
      </div>
      <div className="col-span-1 text-xxs" style={{ color: "var(--ink-3)" }}>{time}</div>
      <div className="col-span-5 font-medium truncate" style={{ color: "var(--ink)" }}>{e.title}</div>
      <div className="col-span-2 text-right text-xxs" style={{ color: "var(--ink-2)" }}>
        {e.forecast ?? "—"}
      </div>
      <div className="col-span-2 text-right text-xxs" style={{ color: hasActual ? "var(--orange)" : "var(--ink-3)" }}>
        {hasActual ? e.actual : (e.previous ?? "—")}
        {hasActual && <span className="ml-1 text-xxs" style={{ color: "var(--ink-3)" }}>(prev: {e.previous ?? "—"})</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portfolio events tab
// ---------------------------------------------------------------------------
const EVENT_TYPES = ["All", "Earnings", "Dividends", "Splits"];

function PortfolioTab() {
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [selectedId, setSelectedId]           = useState<string>("");
  const [typeFilter,  setTypeFilter]           = useState("All");

  useEffect(() => {
    const pfs = loadPortfolios();
    setSavedPortfolios(pfs);
    if (pfs.length > 0) setSelectedId(pfs[0].id);
  }, []);

  const selected = savedPortfolios.find(p => p.id === selectedId);
  const tickers  = selected?.result
    ? Object.keys(selected.result.weights)
    : (selected?.tickers ?? []);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["calendar_portfolio", selectedId],
    queryFn: () => post<{ events: PortfolioEvent[] }>("/calendar/portfolio", { tickers }),
    enabled: tickers.length > 0,
    staleTime: 60 * 60 * 1000,
  });

  const events = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((e) => {
      if (typeFilter === "Earnings")  return e.type === "earnings";
      if (typeFilter === "Dividends") return e.type === "exdividend" || e.type === "dividend";
      if (typeFilter === "Splits")    return e.type === "split";
      return true;
    });
  }, [data, typeFilter]);

  const grouped = useMemo(() => groupByDate(events), [events]);

  if (savedPortfolios.length === 0) {
    return <EmptyState message="No saved portfolios. Optimize and save one in the Portfolio section." />;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="text-xxs uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>Portfolio</div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded focus:outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
          >
            {savedPortfolios.map((pf) => (
              <option key={pf.id} value={pf.id}>{pf.name} — {pf.method}</option>
            ))}
          </select>
        </div>
        <div className="h-8 w-px" style={{ background: "var(--border)" }} />
        <FilterGroup label="Type" options={EVENT_TYPES} value={typeFilter} onChange={setTypeFilter} />
        <div className="flex-1" />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xxs px-2 py-1 rounded transition-colors"
          style={{ color: "var(--ink-3)", border: "1px solid var(--border)" }}
        >
          <RefreshCw size={10} className={isFetching ? "animate-spin" : ""} />
          REFRESH
        </button>
      </div>

      {/* Tickers in selected portfolio */}
      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tickers.map((t) => (
            <span key={t} className="text-xxs px-2 py-0.5 rounded font-medium"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--orange)" }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {isLoading && <SkeletonChart height={300} />}
      {isError   && <EmptyState message="Could not load corporate events." />}

      {data && events.length === 0 && !isLoading && (
        <EmptyState message="No upcoming events found for this portfolio." />
      )}

      {data && events.length > 0 && !isLoading && (
        <div className="space-y-0">
          {[...grouped.entries()].map(([day, dayEvents]) => (
            <div key={day}>
              <DayHeader dateStr={day} />
              <div className="space-y-2">
                {dayEvents.map((e, i) => <PortfolioEventCard key={i} event={e} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioEventCard({ event: e }: { event: PortfolioEvent }) {
  const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    earnings:   { label: "EARNINGS",    icon: <TrendingUp size={12} />,  color: "var(--blue)" },
    exdividend: { label: "EX-DIV",      icon: <DollarSign size={12} />,  color: "var(--green)" },
    dividend:   { label: "DIV PAY",     icon: <DollarSign size={12} />,  color: "var(--green)" },
    split:      { label: "SPLIT",       icon: <ChevronDown size={12} />, color: "var(--purple, #A855F7)" },
  };
  const cfg = typeConfig[e.type] ?? { label: e.type.toUpperCase(), icon: null, color: "var(--ink-3)" };

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 min-w-[100px]">
        <span style={{ color: cfg.color }}>{cfg.icon}</span>
        <span className="text-xxs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
      </div>
      <div className="font-semibold text-xs" style={{ color: "var(--orange)", minWidth: 60 }}>{e.ticker}</div>
      <div className="flex flex-wrap gap-4 text-xs flex-1">
        {e.type === "earnings" && (
          <>
            {e.eps_avg   != null && <MetaPair label="EPS Est." value={`$${e.eps_avg}`} />}
            {e.eps_low   != null && e.eps_high != null && <MetaPair label="EPS Range" value={`$${e.eps_low} – $${e.eps_high}`} />}
            {e.revenue_avg != null && <MetaPair label="Rev Est." value={`$${(e.revenue_avg / 1e9).toFixed(2)}B`} />}
          </>
        )}
        {(e.type === "exdividend" || e.type === "dividend") && e.amount != null && (
          <MetaPair label="Last Div." value={`$${e.amount}`} />
        )}
        {e.type === "split" && e.ratio != null && (
          <MetaPair label="Ratio" value={`${e.ratio}:1`} />
        )}
      </div>
      <div className="text-xxs" style={{ color: "var(--ink-3)" }}>{countdownLabel(e.date)}</div>
    </div>
  );
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xxs" style={{ color: "var(--ink-3)" }}>{label}</div>
      <div className="font-medium" style={{ color: "var(--ink)" }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------
function FilterGroup({
  label, options, value, onChange, colorFn,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colorFn?: (v: string) => string | undefined;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xxs uppercase tracking-widest mr-1" style={{ color: "var(--ink-3)" }}>{label}:</span>
      {options.map((opt) => {
        const active = opt === value;
        const accent = colorFn?.(opt);
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="text-xxs px-2 py-0.5 rounded transition-colors font-medium"
            style={{
              background: active ? (accent ? `${accent}22` : "var(--orange-dim)") : "transparent",
              color: active ? (accent ?? "var(--orange)") : "var(--ink-3)",
              border: `1px solid ${active ? (accent ?? "var(--orange-border)") : "var(--border)"}`,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 rounded-lg text-xs"
      style={{ border: "1px dashed var(--border)", color: "var(--ink-3)" }}>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Tab = "economic" | "portfolio";

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>("economic");

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: "var(--ink)" }}>
            Calendar
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-6" style={{ borderBottom: "1px solid var(--border)" }}>
          {(["economic", "portfolio"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "pb-2.5 text-xs tracking-widest uppercase transition-colors border-b-2 -mb-px",
                tab === t ? "border-b-2" : "border-transparent hover:text-ink-primary"
              )}
              style={
                tab === t
                  ? { color: "var(--orange)", borderBottomColor: "var(--orange)" }
                  : { color: "var(--ink-3)", borderBottomColor: "transparent" }
              }
            >
              {t === "economic" ? "ECONOMIC CALENDAR" : "PORTFOLIO EVENTS"}
            </button>
          ))}
        </div>

        {tab === "economic"  && <EconomicTab />}
        {tab === "portfolio" && <PortfolioTab />}
      </div>
    </ErrorBoundary>
  );
}
