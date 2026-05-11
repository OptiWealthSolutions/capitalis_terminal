"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight, ArrowDownRight, Trophy, Flame, Share2, Eye,
  ExternalLink, ChevronRight, Bell, Sparkles, Briefcase, Activity,
  RefreshCw, QrCode,
} from "lucide-react";
import { get, post } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useWatchlist } from "@/lib/watchlist";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import TickerLogo from "@/components/ui/TickerLogo";
import PlotlyChart from "@/components/charts/PlotlyChart";
import QRShareModal from "@/components/ui/QRShareModal";
import { Card, CardHeader, SectionLabel } from "@/components/ui/Card";
import type { PerformanceResult, TrackerPerfResult } from "@/lib/types";

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

interface CommunityPost {
  id: string; user_id: string; display_name?: string; avatar_url?: string;
  content: string; ticker?: string | null; link_url?: string | null;
  upvotes?: number; created_at: string;
}

interface NewsItem {
  title: string; publisher: string; published: string; link: string;
  summary?: string; thumbnail?: string;
}

interface SavedPortfolio {
  id: string; name: string; tickers: string[]; weights: number[];
  method: string; capital: number; savedAt: string;
}
interface TrackerPortfolio {
  id: string; name: string; createdAt: string;
  positions: { id: string; ticker: string; shares: number; entry_price: number; entry_date: string }[];
}

interface LeaderRow {
  user_id: string; display_name: string; avatar_url?: string | null;
  return_pct: number; cost: number; value: number;
  positions_count: number; rank: number;
}
interface LeaderboardResponse {
  top: LeaderRow[]; me: LeaderRow | null;
  me_rank: number | null; me_percentile: number | null; total_users: number;
}

// ---------------------------------------------------------------------------
// Exchanges — world clock style
// ---------------------------------------------------------------------------
interface Exchange { name: string; short: string; flag: string; city: string; openLocal: string; closeLocal: string; tzOffset: number; }

const EXCHANGES: Exchange[] = [
  { name: "New York Stock Exchange",        short: "NYSE",  flag: "🇺🇸", city: "New York",   openLocal: "09:30", closeLocal: "16:00", tzOffset: -5 },
  { name: "Nasdaq",                         short: "NASD",  flag: "🇺🇸", city: "New York",   openLocal: "09:30", closeLocal: "16:00", tzOffset: -5 },
  { name: "Toronto Stock Exchange",         short: "TSX",   flag: "🇨🇦", city: "Toronto",    openLocal: "09:30", closeLocal: "16:00", tzOffset: -5 },
  { name: "London Stock Exchange",          short: "LSE",   flag: "🇬🇧", city: "London",     openLocal: "08:00", closeLocal: "16:30", tzOffset: 0  },
  { name: "Euronext Paris",                 short: "PAR",   flag: "🇫🇷", city: "Paris",      openLocal: "09:00", closeLocal: "17:30", tzOffset: 1  },
  { name: "Xetra",                          short: "XETRA", flag: "🇩🇪", city: "Frankfurt",  openLocal: "09:00", closeLocal: "17:30", tzOffset: 1  },
  { name: "Hong Kong Stock Exchange",       short: "HKEX",  flag: "🇭🇰", city: "Hong Kong",  openLocal: "09:30", closeLocal: "16:00", tzOffset: 8  },
  { name: "Japan Exchange Group",           short: "JPX",   flag: "🇯🇵", city: "Tokyo",      openLocal: "09:00", closeLocal: "15:30", tzOffset: 9  },
  { name: "Shanghai Stock Exchange",        short: "SSE",   flag: "🇨🇳", city: "Shanghai",   openLocal: "09:30", closeLocal: "15:00", tzOffset: 8  },
  { name: "Australian Securities Exchange", short: "ASX",   flag: "🇦🇺", city: "Sydney",     openLocal: "10:00", closeLocal: "16:00", tzOffset: 11 },
];

function exchangeStatus(ex: Exchange, now: Date) {
  const userOffsetH = -now.getTimezoneOffset() / 60;
  const shift = userOffsetH - ex.tzOffset;
  const toLocalExch = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    let totalMin = h * 60 + m - shift * 60;
    totalMin = ((totalMin % 1440) + 1440) % 1440;
    return totalMin;
  };
  const nowInExch = () => {
    const userOffMin = now.getHours() * 60 + now.getMinutes();
    let exMin = userOffMin + (ex.tzOffset - userOffsetH) * 60;
    exMin = ((exMin % 1440) + 1440) % 1440;
    const hh = Math.floor(exMin / 60).toString().padStart(2, "0");
    const mm = Math.floor(exMin % 60).toString().padStart(2, "0");
    return { min: exMin, str: `${hh}:${mm}` };
  };
  const { min: nowExchMin, str: localTime } = nowInExch();
  const openM = toLocalExch(ex.openLocal), closeM = toLocalExch(ex.closeLocal);
  const dow = now.getDay();
  const weekend = dow === 0 || dow === 6;
  const isOpen = !weekend && (openM <= closeM ? nowExchMin >= openM && nowExchMin < closeM : nowExchMin >= openM || nowExchMin < closeM);
  const minsToOpen = isOpen ? null : ((openM - nowExchMin + 1440) % 1440);
  const minsToClose = isOpen ? ((closeM - nowExchMin + 1440) % 1440) : null;
  return { localTime, isOpen, minsToOpen, minsToClose };
}

function fmtCountdown(mins: number | null): string {
  if (mins == null) return "";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}
function fmtNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtEur(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(1, (Date.now() - t) / 1000);
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}j`;
}
function avatarColor(seed: string) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `oklch(0.65 0.10 ${hue})`;
}

// ---------------------------------------------------------------------------
// Watchlist row with weekly/monthly performance
// ---------------------------------------------------------------------------
interface HistoryResponse { dates: string[]; close: number[]; }

function calcPerf(close: number[]): { weekly: number | null; monthly: number | null } {
  const n = close.length;
  if (n < 2) return { weekly: null, monthly: null };
  const last = close[n - 1];
  const weeklyBase = close[Math.max(0, n - 1 - 5)];
  const monthlyBase = close[0];
  const weekly  = weeklyBase  > 0 ? ((last / weeklyBase)  - 1) * 100 : null;
  const monthly = monthlyBase > 0 ? ((last / monthlyBase) - 1) * 100 : null;
  const cap = (v: number | null) => v == null ? null : Math.max(-99.9, Math.min(99.9, v));
  return { weekly: cap(weekly), monthly: cap(monthly) };
}

function PerfCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: "var(--t3)", fontVariantNumeric: "tabular-nums", fontSize: "0.72rem" }}>—</span>;
  const pos = value >= 0;
  return (
    <span style={{ color: pos ? "var(--green)" : "var(--red)", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: "0.72rem" }}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function WatchlistRow({ ticker, isLast, onRemove }: { ticker: string; isLast: boolean; onRemove: () => void }) {
  const hist = useQuery<HistoryResponse>({
    queryKey: ["wl-hist", ticker],
    queryFn: () => get(`/equity/${encodeURIComponent(ticker)}/history?period=1mo&interval=1d`),
    staleTime: 300_000,
    retry: false,
  });

  const perf = hist.data?.close ? calcPerf(hist.data.close) : { weekly: null, monthly: null };

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderBottom: isLast ? "none" : "1px solid var(--card-border)", transition: "background 0.12s" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-inner)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <TickerLogo ticker={ticker} size={22} />
      <Link href={`/equity?ticker=${encodeURIComponent(ticker)}`} style={{ flex: 1, fontFamily: "Manrope, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "var(--orange)", textDecoration: "none" }}>{ticker}</Link>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, minWidth: 52 }}>
          <span style={{ fontSize: "0.54rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t3)" }}>5J</span>
          <PerfCell value={hist.isLoading ? null : perf.weekly} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, minWidth: 52 }}>
          <span style={{ fontSize: "0.54rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--t3)" }}>1M</span>
          <PerfCell value={hist.isLoading ? null : perf.monthly} />
        </div>
      </div>
      <button onClick={onRemove} title="Retirer"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "transparent", border: "1px solid var(--card-border)", color: "var(--t3)", cursor: "pointer", fontSize: "0.7rem", flexShrink: 0, transition: "all 0.12s" }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(212,133,133,0.15)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)"; }}
      >×</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocation mini donut
// ---------------------------------------------------------------------------
const ALLOC_COLORS = ["#F97316", "#7AA7E8", "#86B38A", "#C9B178", "#D48585", "#9B87B8"];

function MiniDonut({ data }: { data: { ticker: string; weight: number }[] }) {
  const total = data.reduce((s, d) => s + d.weight, 0) || 1;
  const R = 32, CIRC = 2 * Math.PI * R, GAP = 1.5;
  let cumFrac = 0;
  const segs = data.map((d, i) => {
    const frac = d.weight / total;
    const arcLen = Math.max(0, frac * CIRC - GAP);
    const startDeg = cumFrac * 360 - 90;
    cumFrac += frac;
    return { ...d, frac, arcLen, startDeg, color: ALLOC_COLORS[i % ALLOC_COLORS.length] };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg viewBox="0 0 88 88" width={72} height={72} style={{ flexShrink: 0 }}>
        <circle cx={44} cy={44} r={R} fill="none" stroke="var(--bg-hover)" strokeWidth={13} />
        {segs.map(seg => (
          <circle key={seg.ticker} cx={44} cy={44} r={R} fill="none" stroke={seg.color}
            strokeWidth={12} strokeLinecap="butt"
            strokeDasharray={`${seg.arcLen} ${CIRC}`}
            transform={`rotate(${seg.startDeg} 44 44)`} />
        ))}
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        {segs.map(seg => (
          <Link key={seg.ticker} href={`/equity?ticker=${seg.ticker}`}
            style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: seg.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: "Manrope, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--orange)" }}>{seg.ticker}</span>
            <span style={{ fontSize: "0.68rem", color: "var(--t2)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{(seg.weight * 100).toFixed(1)}%</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline sparkline SVG
// ---------------------------------------------------------------------------
function Sparkline({ data, width = 220, height = 64, color }: { data: number[]; width?: number; height?: number; color: string }) {
  if (!data?.length) return <div style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const lastY = height - ((last - min) / range) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(data.length - 1) * stepX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type TimeRange = "6mo" | "1y" | "3y" | "5y";
function rangeToStartDate(r: TimeRange): string {
  const d = new Date();
  if (r === "6mo") d.setMonth(d.getMonth() - 6);
  else if (r === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (r === "3y") d.setFullYear(d.getFullYear() - 3);
  else if (r === "5y") d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split("T")[0];
}

export default function DashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { watchlist, toggleWatchlist } = useWatchlist();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ──────────────── Portfolios + perf
  const [optPortfolios,     setOptPortfolios]     = useState<SavedPortfolio[]>([]);
  const [trackerPortfolios, setTrackerPortfolios] = useState<TrackerPortfolio[]>([]);
  const [selectedOptId,     setSelectedOptId]     = useState<string | null>(null);
  const [selectedTrkId,     setSelectedTrkId]     = useState<string | null>(null);
  const [perfResult,        setPerfResult]        = useState<PerformanceResult | null>(null);
  const [trackerResult,     setTrackerResult]     = useState<TrackerPerfResult | null>(null);
  const [optTimeRange,      setOptTimeRange]      = useState<TimeRange>("1y");
  const [qrPerfOpen,        setQrPerfOpen]        = useState(false);

  useEffect(() => {
    get<{ name: string; tickers: string[]; weights: number[]; capital: number; method: string; created_at: string }[]>("/portfolio/saved")
      .then(rows => {
        const opts = rows.map(r => ({ id: r.name, name: r.name, tickers: r.tickers, weights: r.weights, method: r.method, capital: r.capital, savedAt: r.created_at }));
        setOptPortfolios(opts);
        if (opts.length > 0) setSelectedOptId(opts[0].id);
      }).catch(() => {});

    get<TrackerPortfolio[]>("/portfolio/tracker")
      .then(trks => { setTrackerPortfolios(trks); if (trks.length > 0) setSelectedTrkId(trks[0].id); })
      .catch(() => {});
  }, []);

  const portfolio = optPortfolios.find(p => p.id === selectedOptId) ?? null;
  const trackerPf = trackerPortfolios.find(p => p.id === selectedTrkId) ?? null;

  const perfMutation = useMutation({
    mutationFn: ({ pf, range }: { pf: SavedPortfolio; range: TimeRange }) =>
      post<PerformanceResult>("/portfolio/performance", {
        tickers: pf.tickers, weights: pf.weights, capital: pf.capital, start_date: rangeToStartDate(range),
      }),
    onSuccess: data => setPerfResult(data),
  });

  const trackerMutation = useMutation({
    mutationFn: (pf: TrackerPortfolio) =>
      post<TrackerPerfResult>("/portfolio/tracker-performance", {
        positions: pf.positions.map(p => ({ ticker: p.ticker, shares: p.shares, entry_price: p.entry_price, entry_date: p.entry_date })),
      }),
    onSuccess: data => setTrackerResult(data),
  });

  useEffect(() => {
    setPerfResult(null);
    if (portfolio && portfolio.tickers.length) perfMutation.mutate({ pf: portfolio, range: optTimeRange });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOptId, optTimeRange]);

  useEffect(() => {
    setTrackerResult(null);
    if (trackerPf && trackerPf.positions.length) trackerMutation.mutate(trackerPf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrkId]);

  // ──────────────── Other queries
  const overview = useQuery<MarketOverview>({
    queryKey: ["market-overview"],
    queryFn: () => get("/market/overview"),
    staleTime: 60_000,
  });

  const community = useQuery<{ posts: CommunityPost[] }>({
    queryKey: ["community-feed-dash"],
    queryFn: () => get("/community/posts?limit=20"),
    staleTime: 120_000,
  });

  const leaderboard = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard-dash"],
    queryFn: () => get("/community/leaderboard?limit=8"),
    staleTime: 300_000,
  });

  const news = useQuery<{ news: NewsItem[] }>({
    queryKey: ["market-news-dash"],
    queryFn: () => get("/market/news"),
    staleTime: 600_000,
  });

  // ──────────────── Derived
  const indices = overview.data?.indices ?? [];
  const stress  = overview.data?.stress;
  const topPosts = community.data?.posts ?? [];

  const exchangeStatuses = useMemo(() => {
    if (!now) return null;
    return EXCHANGES.map(ex => ({ ...ex, ...exchangeStatus(ex, now) }));
  }, [now]);

  // Top tickers by community mentions — real, not mock
  const topMentionedTickers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of topPosts) {
      const tk = (p.ticker || "").toUpperCase().trim();
      if (tk) counts[tk] = (counts[tk] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [topPosts]);

  // User performance: derive from tracker if present, else from optimized perf
  const userReturn = trackerResult?.metrics.total_return ?? perfResult?.metrics.total_return ?? null;
  const userCurrentValue = trackerResult?.metrics.current_value ?? perfResult?.metrics.current_value ?? null;

  const dateLabel = now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  const timeLabel = now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  const spxYTD = indices.find(i => i.symbol === "^GSPC")?.change_period_pct ?? null;

  // Equity curve for hero — use tracker if available, else portfolio
  const heroCurve = trackerResult?.portfolio_values ?? perfResult?.portfolio_values ?? [];
  const heroCurveSmall = useMemo(() => {
    if (!heroCurve.length) return [] as number[];
    if (heroCurve.length <= 30) return heroCurve;
    const step = Math.floor(heroCurve.length / 30);
    const out: number[] = [];
    for (let i = 0; i < heroCurve.length; i += step) out.push(heroCurve[i]);
    return out;
  }, [heroCurve]);

  // Donut for optimized portfolio
  const donutData = portfolio ? portfolio.tickers.map((t, i) => ({ ticker: t, weight: portfolio.weights[i] ?? 0 })) : [];

  const hasAnyPortfolio = optPortfolios.length > 0 || trackerPortfolios.length > 0;
  const lb = leaderboard.data;

  return (
    <ErrorBoundary>
      <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.06em", color: "var(--t3)", marginBottom: 4 }}>
              Tableau de bord · <span style={{ textTransform: "capitalize" }}>{dateLabel}</span> · {timeLabel}
            </p>
            <h1 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
              Bienvenue sur Capitalis
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--t3)", marginTop: 4 }}>
              Vos performances. Le marché. La communauté. En un seul écran.
            </p>
          </div>
          {stress && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: "var(--r-xl)", background: "var(--bg-card)", border: "1px solid var(--card-border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: stress.score < 25 ? "var(--green)" : stress.score < 50 ? "var(--orange)" : "var(--red)" }} />
              <span style={{ fontSize: "0.7rem", color: "var(--t3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Stress marché</span>
              <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--t1)" }}>{stress.score.toFixed(1)}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--t3)" }}>{stress.regime}</span>
            </div>
          )}
        </div>

        {/* PERFORMANCE STRIP — asymmetric 60/40 */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)", gap: 14, marginBottom: 24 }}>

          <Card pad="xl" style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0, flex: 1 }}>
              <div>
                <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 4 }}>
                  {trackerResult ? `Tracker · ${trackerPf?.name ?? ""}` : perfResult ? `Optimisé · ${portfolio?.name ?? ""}` : "Votre performance"}
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "2.6rem", fontWeight: 700, letterSpacing: "-0.02em", color: userReturn == null ? "var(--t2)" : userReturn >= 0 ? "var(--green)" : "var(--red)", lineHeight: 1 }}>
                    {userReturn == null ? "—" : fmtPct(userReturn * 100, 1)}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--t3)" }}>
                    {userCurrentValue != null && <>· {fmtEur(userCurrentValue)} </>}
                    {spxYTD != null && <>· vs S&amp;P 500 {fmtPct(spxYTD, 1)}</>}
                  </span>
                </div>
                {!hasAnyPortfolio && !perfMutation.isPending && !trackerMutation.isPending && (
                  <p style={{ fontSize: "0.74rem", color: "var(--t3)", marginTop: 8 }}>
                    Aucun portefeuille. <Link href="/portfolio" style={{ color: "var(--orange)" }}>Créez-en un</Link> ou <Link href="/tracker" style={{ color: "var(--orange)" }}>importez un tracker</Link>.
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <Link href={trackerResult ? "/tracker" : "/portfolio"} style={{ fontSize: "0.72rem", color: "var(--orange)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                  Voir le détail <ChevronRight size={11} />
                </Link>
                <span style={{ width: 1, height: 12, background: "var(--card-border)" }} />
                <Link href="/community" style={{ fontSize: "0.72rem", color: "var(--t2)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 500 }}>
                  <Share2 size={11} /> Partager
                </Link>
                {userReturn != null && (
                  <>
                    <span style={{ width: 1, height: 12, background: "var(--card-border)" }} />
                    <button
                      onClick={() => setQrPerfOpen(true)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--t2)", fontSize: "0.72rem", fontWeight: 500,
                        padding: 0,
                      }}
                    >
                      <QrCode size={11} /> QR
                    </button>
                  </>
                )}
                {trackerPortfolios.length > 1 && (
                  <>
                    <span style={{ width: 1, height: 12, background: "var(--card-border)" }} />
                    <select value={selectedTrkId ?? ""} onChange={e => setSelectedTrkId(e.target.value || null)}
                      style={{ fontSize: "0.7rem", padding: "3px 8px", background: "var(--bg-inner)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", color: "var(--t2)" }}>
                      <option value="">— tracker —</option>
                      {trackerPortfolios.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </>
                )}
                {(perfMutation.isPending || trackerMutation.isPending) && <LoadingSpinner size="sm" />}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexShrink: 0 }}>
              {heroCurveSmall.length > 1 ? (
                <Sparkline data={heroCurveSmall} width={260} height={84} color={(userReturn ?? 0) >= 0 ? "var(--green)" : "var(--red)"} />
              ) : (
                <div style={{ width: 260, height: 84, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: "0.7rem", border: "1px dashed var(--card-border)", borderRadius: "var(--r-md)" }}>
                  Pas de courbe
                </div>
              )}
            </div>
          </Card>

          {/* Real ranking */}
          <Card pad="lg" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)" }}>
                Classement communauté
              </p>
              <Link href="/community" style={{ fontSize: "0.65rem", color: "var(--orange)", textDecoration: "none" }}>Voir tout</Link>
            </div>

            {leaderboard.isLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size="sm" /></div>
            ) : !lb || lb.total_users === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "12px 0" }}>
                <p style={{ fontSize: "0.78rem", color: "var(--t2)", lineHeight: 1.5, marginBottom: 8 }}>
                  Personne n&apos;a encore de portefeuille tracker.
                </p>
                <Link href="/tracker" style={{ fontSize: "0.7rem", color: "var(--orange)", fontWeight: 600 }}>Créez le premier →</Link>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0 10px" }}>
                  {lb.me_rank ? (
                    <>
                      <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.7rem", fontWeight: 700, color: "var(--orange)", letterSpacing: "-0.01em" }}>
                        #{lb.me_rank}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--t3)" }}>
                        / {lb.total_users}
                        {lb.me_percentile != null && ` · top ${100 - lb.me_percentile}%`}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: "0.78rem", color: "var(--t3)" }}>
                      Non classé · <Link href="/tracker" style={{ color: "var(--orange)" }}>ajoutez un tracker</Link>
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {lb.top.slice(0, 3).map(row => (
                    <div key={row.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.68rem", fontWeight: 700, color: row.rank === 1 ? "var(--orange)" : "var(--t3)", minWidth: 18 }}>
                        {row.rank === 1 ? <Trophy size={11} style={{ display: "inline", verticalAlign: "middle" }} /> : `#${row.rank}`}
                      </span>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: avatarColor(row.user_id), flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "0.74rem", color: "var(--t1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.display_name}</span>
                      <span style={{ fontSize: "0.74rem", fontWeight: 700, color: row.return_pct >= 0 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums" }}>
                        {fmtPct(row.return_pct, 1)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* INDICES STRIP — full-width scrollable ticker tape */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--t1)" }}>Indices</h2>
            <Link href="/value-chain" style={{ fontSize: "0.7rem", color: "var(--orange)", textDecoration: "none" }}>Market Map →</Link>
          </div>
          {overview.isLoading ? (
            <Card pad="none" style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
              <LoadingSpinner size="md" />
            </Card>
          ) : indices.length === 0 ? (
            <Card variant="ghost" pad="md" style={{ width: "100%", textAlign: "center", color: "var(--t3)", fontSize: "0.78rem" }}>
              Aucune donnée d&apos;indice disponible.
            </Card>
          ) : (
            <div style={{ position: "relative", overflow: "hidden", background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", padding: "10px 0", width: "100%" }}>
              <style>{`
                @keyframes ticker-scroll {
                  0%   { transform: translateX(0); }
                  100% { transform: translateX(-50%); }
                }
                .ticker-track { display: flex; gap: 0; animation: ticker-scroll ${Math.max(20, indices.length * 4)}s linear infinite; width: max-content; }
                .ticker-track:hover { animation-play-state: paused; }
              `}</style>
              <div className="ticker-track">
                {[...indices, ...indices].map((idx, i) => {
                  const positive = idx.change_1d_pct >= 0;
                  const color = positive ? "var(--green)" : "var(--red)";
                  return (
                    <Link key={`${idx.symbol}-${i}`} href={`/equity?ticker=${encodeURIComponent(idx.symbol)}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 18px", textDecoration: "none", borderRight: "1px solid var(--card-border)", flexShrink: 0, whiteSpace: "nowrap", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-inner)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.66rem", fontWeight: 700, color: "var(--t3)", lineHeight: 1, marginBottom: 2 }}>{idx.label}</p>
                        <p style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.92rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtNumber(idx.price)}</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 6px", borderRadius: "9999px", background: positive ? "rgba(134,179,138,0.12)" : "rgba(212,133,133,0.12)", color, fontSize: "0.66rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {positive ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                          {fmtPct(idx.change_1d_pct, 2)}
                        </span>
                        {idx.change_5d_pct != null && (
                          <span style={{ fontSize: "0.56rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>5J {fmtPct(idx.change_5d_pct, 1)}</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* MARKET PULSE — 2fr / 1fr asymmetric: Watchlist (left) | World clocks (right) */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "stretch" }}>

            {/* Left (2fr): Watchlist */}
            <Card variant="dark" pad="none" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <CardHeader
                title="Watchlist"
                icon={<Eye size={12} />}
                action={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "0.6rem", padding: "1px 7px", borderRadius: "9999px", background: "var(--bg-inner)", color: "var(--t3)", border: "1px solid var(--card-border)" }}>{watchlist.length}</span>
                    <Link href="/equity" style={{ fontSize: "0.65rem", color: "var(--orange)", textDecoration: "none", fontWeight: 600 }}>+ Ajouter</Link>
                  </div>
                }
              />
              <div style={{ flex: 1, overflowY: "auto" }}>
                {watchlist.length === 0 ? (
                  <Card variant="ghost" pad="lg" style={{ margin: 16, textAlign: "center", color: "var(--t3)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                    Aucun titre suivi.<br />
                    <Link href="/equity" style={{ color: "var(--orange)" }}>Recherchez une action →</Link>
                  </Card>
                ) : watchlist.map((tk, idx) => (
                  <WatchlistRow key={tk} ticker={tk} isLast={idx === watchlist.length - 1} onRemove={() => toggleWatchlist(tk)} />
                ))}
              </div>
            </Card>

            {/* Right (1fr): World clocks */}
            <Card variant="dark" pad="none" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <CardHeader
                title="Horloges mondiales"
                icon={<Activity size={12} />}
                action={exchangeStatuses ? (
                  <SectionLabel>
                    {exchangeStatuses.filter(e => e.isOpen).length}/{exchangeStatuses.length} ouvertes
                  </SectionLabel>
                ) : undefined}
              />
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, alignContent: "start" }}>
                {!exchangeStatuses ? (
                  <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
                    <LoadingSpinner size="sm" />
                  </div>
                ) : exchangeStatuses.map(ex => (
                  <div
                    key={ex.short}
                    style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", padding: "10px 12px", borderRadius: "var(--r-md)", background: ex.isOpen ? "var(--bg-card)" : "var(--bg-inner)", border: "1px solid var(--card-border)", cursor: "default", transition: "border-color 0.12s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
                  >
                    {ex.isOpen && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--green)", opacity: 0.7 }} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      <span style={{ fontSize: "0.8rem" }}>{ex.flag}</span>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.64rem", fontWeight: 700, color: "var(--t2)", letterSpacing: "0.04em" }}>{ex.short}</span>
                    </div>
                    <p style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--t1)", fontVariantNumeric: "tabular-nums", lineHeight: 1, marginBottom: 3 }}>{ex.localTime}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: ex.isOpen ? "var(--green)" : "var(--t3)", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.58rem", color: ex.isOpen ? "var(--green)" : "var(--t3)", fontWeight: 600 }}>
                        {ex.isOpen ? `ferme ${fmtCountdown(ex.minsToClose)}` : `ouvre ${fmtCountdown(ex.minsToOpen)}`}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.52rem", color: "var(--t3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.city}</p>
                  </div>
                ))}
              </div>
            </Card>

          </div>
        </section>


        {/* TRACKER + OPTIMIZED PORTFOLIO — 2-col when both exist */}
        {hasAnyPortfolio && (
          <section style={{ marginBottom: 24, display: "grid", gridTemplateColumns: trackerPortfolios.length > 0 && optPortfolios.length > 0 ? "minmax(0, 1.4fr) minmax(0, 1fr)" : "1fr", gap: 14 }}>

            {/* Tracker performance + positions */}
            {trackerPortfolios.length > 0 && (
              <Card pad="none" style={{ overflow: "hidden" }}>
                <CardHeader
                  icon={<Activity size={13} />}
                  title={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span>Tracker · {trackerPf?.name}</span>
                      {trackerResult && (
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 8px", borderRadius: "9999px", background: trackerResult.metrics.total_return >= 0 ? "rgba(134,179,138,0.15)" : "rgba(212,133,133,0.15)", color: trackerResult.metrics.total_return >= 0 ? "var(--green)" : "var(--red)", border: `1px solid ${trackerResult.metrics.total_return >= 0 ? "rgba(134,179,138,0.3)" : "rgba(212,133,133,0.3)"}` }}>
                          {fmtPct(trackerResult.metrics.total_return * 100, 2)}
                        </span>
                      )}
                    </span>
                  }
                  action={
                    <Link href="/tracker" style={{ fontSize: "0.68rem", color: "var(--orange)", textDecoration: "none" }}>Voir le tracker →</Link>
                  }
                />

                {trackerMutation.isPending && !trackerResult ? (
                  <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><LoadingSpinner size="md" /></div>
                ) : trackerResult ? (
                  <>
                    {/* Equity curve */}
                    <div style={{ padding: "12px 20px 4px" }}>
                      <PlotlyChart
                        data={[
                          { type: "scatter", mode: "lines", x: trackerResult.dates, y: trackerResult.portfolio_values, name: "Portefeuille",
                            line: { color: trackerResult.metrics.total_return >= 0 ? "#86B38A" : "#D48585", width: 2 },
                            fill: "tozeroy", fillcolor: trackerResult.metrics.total_return >= 0 ? "rgba(134,179,138,0.06)" : "rgba(212,133,133,0.06)",
                            hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>" },
                          { type: "scatter", mode: "lines", x: trackerResult.dates, y: trackerResult.cost_basis, name: "Coût",
                            line: { color: "#94A3B8", width: 1.4, dash: "dot" }, hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>" },
                        ]}
                        layout={{
                          margin: { t: 8, b: 28, l: 48, r: 16 },
                          showlegend: false,
                          paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                          xaxis: {
                            showgrid: false,
                            color: isDark ? "rgba(245,245,245,0.45)" : "rgba(17,17,17,0.5)",
                            range: trackerResult.dates.length > 0 ? [trackerResult.dates[0], trackerResult.dates[trackerResult.dates.length - 1]] : undefined,
                            autorange: false,
                          },
                          yaxis: { showgrid: true, gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", color: isDark ? "rgba(245,245,245,0.45)" : "rgba(17,17,17,0.5)", tickformat: ",.0f" },
                        }}
                        height={200}
                      />
                    </div>

                    {/* Metrics row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--card-border)" }}>
                      {[
                        { label: "Valeur",   v: fmtEur(trackerResult.metrics.current_value),  c: "var(--t1)" },
                        { label: "Coût",     v: fmtEur(trackerResult.metrics.cost_basis),     c: "var(--t2)" },
                        { label: "P&L",      v: fmtEur(trackerResult.metrics.unrealized_pnl), c: trackerResult.metrics.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)" },
                        { label: "Drawdown", v: fmtPct(trackerResult.metrics.max_drawdown * 100, 1), c: "var(--red)" },
                      ].map((m, i) => (
                        <div key={m.label} style={{ padding: "10px 16px", borderRight: i < 3 ? "1px solid var(--card-border)" : "none" }}>
                          <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>{m.label}</p>
                          <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.95rem", fontWeight: 700, color: m.c, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{m.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Top positions */}
                    <div style={{ borderTop: "1px solid var(--card-border)", padding: "10px 20px" }}>
                      <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 8 }}>Top positions</p>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {trackerResult.positions.slice(0, 5).map(pos => (
                          <Link key={pos.ticker} href={`/equity?ticker=${pos.ticker}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", textDecoration: "none", borderBottom: "1px solid var(--card-border)" }}>
                            <TickerLogo ticker={pos.ticker} size={22} />
                            <span style={{ flex: 1, fontFamily: "Manrope, sans-serif", fontSize: "0.78rem", fontWeight: 700, color: "var(--orange)" }}>{pos.ticker}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{pos.shares} × {fmtEur(pos.entry_price)}</span>
                            <span style={{ fontSize: "0.74rem", fontWeight: 700, color: (pos.return_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums", minWidth: 56, textAlign: "right" }}>
                              {pos.return_pct == null ? "—" : fmtPct(pos.return_pct * 100, 1)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: "0.78rem" }}>Aucune donnée pour ce tracker.</div>
                )}
              </Card>
            )}

            {/* Optimized portfolio */}
            {optPortfolios.length > 0 && (
              <Card pad="none" style={{ overflow: "hidden" }}>
                <CardHeader
                  icon={<Briefcase size={13} />}
                  title="Portefeuille optimisé"
                  action={
                    optPortfolios.length > 1 ? (
                      <select value={selectedOptId ?? ""} onChange={e => setSelectedOptId(e.target.value)}
                        style={{ fontSize: "0.7rem", padding: "3px 8px", background: "var(--bg-inner)", border: "1px solid var(--card-border)", borderRadius: "var(--r-sm)", color: "var(--t2)" }}>
                        {optPortfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : undefined
                  }
                />

                <div style={{ padding: "10px 20px 4px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {(["6mo","1y","3y","5y"] as TimeRange[]).map(r => (
                    <button key={r} onClick={() => setOptTimeRange(r)}
                      style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "9999px",
                        background: optTimeRange === r ? "var(--orange-dim)" : "transparent",
                        border: `1px solid ${optTimeRange === r ? "var(--orange-border)" : "var(--card-border)"}`,
                        color: optTimeRange === r ? "var(--orange)" : "var(--t3)", cursor: "pointer" }}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                  <button onClick={() => portfolio && perfMutation.mutate({ pf: portfolio, range: optTimeRange })}
                    disabled={perfMutation.isPending}
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.65rem", padding: "3px 8px", borderRadius: "var(--r-sm)", border: "1px solid var(--card-border)", background: "transparent", color: "var(--t3)", cursor: "pointer" }}>
                    <RefreshCw size={9} /> Refresh
                  </button>
                </div>

                {perfMutation.isPending && !perfResult ? (
                  <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><LoadingSpinner size="md" /></div>
                ) : perfResult ? (
                  <>
                    <div style={{ padding: "8px 20px 4px" }}>
                      <PlotlyChart
                        data={[
                          { type: "scatter", mode: "lines", x: perfResult.dates, y: perfResult.portfolio_values, name: portfolio?.name ?? "Portefeuille",
                            line: { color: "#3E6FB7", width: 2 }, fill: "tozeroy",
                            fillcolor: isDark ? "rgba(62,111,183,0.08)" : "rgba(62,111,183,0.06)",
                            hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>" },
                          { type: "scatter", mode: "lines", x: perfResult.dates, y: perfResult.benchmark_values, name: "SPY",
                            line: { color: "#94A3B8", width: 1.4, dash: "dot" }, hovertemplate: "%{x}: €%{y:,.0f}<extra></extra>" },
                        ]}
                        layout={{
                          margin: { t: 8, b: 28, l: 48, r: 16 },
                          showlegend: false,
                          paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                          xaxis: {
                            showgrid: false,
                            color: isDark ? "rgba(245,245,245,0.45)" : "rgba(17,17,17,0.5)",
                            range: perfResult.dates.length > 0 ? [perfResult.dates[0], perfResult.dates[perfResult.dates.length - 1]] : undefined,
                            autorange: false,
                          },
                          yaxis: { showgrid: true, gridcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", color: isDark ? "rgba(245,245,245,0.45)" : "rgba(17,17,17,0.5)", tickformat: ",.0f" },
                        }}
                        height={170}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid var(--card-border)" }}>
                      {[
                        { label: "Total Return", v: fmtPct((perfResult.metrics.total_return ?? 0) * 100, 2),
                          c: (perfResult.metrics.total_return ?? 0) >= 0 ? "var(--green)" : "var(--red)" },
                        { label: "Sharpe", v: perfResult.metrics.sharpe_ratio == null ? "—" : perfResult.metrics.sharpe_ratio.toFixed(3), c: "var(--orange)" },
                        { label: "Drawdown", v: fmtPct((perfResult.metrics.max_drawdown ?? 0) * 100, 1), c: "var(--red)" },
                      ].map((m, i) => (
                        <div key={m.label} style={{ padding: "10px 14px", borderRight: i < 2 ? "1px solid var(--card-border)" : "none" }}>
                          <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>{m.label}</p>
                          <p style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.9rem", fontWeight: 700, color: m.c, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{m.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Allocation */}
                    {donutData.length > 0 && (
                      <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 20px" }}>
                        <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10 }}>Allocation</p>
                        <MiniDonut data={donutData.slice(0, 6)} />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: "0.78rem" }}>Sélectionnez un portefeuille.</div>
                )}
              </Card>
            )}
          </section>
        )}

        {/* COMMUNITY + LEADERBOARD */}
        <section style={{ marginBottom: 24, display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14 }}>

          <Card pad="none" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <CardHeader
              icon={<Flame size={13} />}
              title="Idées de la commu"
              action={<Link href="/community" style={{ fontSize: "0.68rem", color: "var(--orange)", textDecoration: "none" }}>Communauté →</Link>}
            />
            <div style={{ padding: "8px 0", flex: 1 }}>
              {community.isLoading ? (
                <div style={{ padding: 24, textAlign: "center" }}><LoadingSpinner size="sm" /></div>
              ) : topPosts.length === 0 ? (
                <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--t3)", fontSize: "0.8rem" }}>
                  Aucune idée partagée. <Link href="/community" style={{ color: "var(--orange)" }}>Soyez le premier.</Link>
                </div>
              ) : topPosts.slice(0, 5).map(post => (
                <Link key={post.id} href="/community" style={{ display: "flex", gap: 12, padding: "10px 20px", textDecoration: "none", borderBottom: "1px solid var(--card-border)", transition: "background 0.12s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-inner)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor(post.user_id), flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--t1)" }}>
                        {post.display_name || post.user_id.slice(0, 8)}
                      </span>
                      {post.ticker && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.6rem", fontWeight: 700, padding: "1px 8px", borderRadius: "9999px", background: "var(--orange-dim)", color: "var(--orange)", border: "1px solid var(--orange-border)" }}>
                          <TickerLogo ticker={post.ticker} size={12} />
                          ${post.ticker}
                        </span>
                      )}
                      <span style={{ fontSize: "0.62rem", color: "var(--t3)", marginLeft: "auto" }}>{timeAgo(post.created_at)}</span>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "var(--t2)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {post.content}
                    </p>
                    {(post.upvotes ?? 0) > 0 && (
                      <span style={{ fontSize: "0.62rem", color: "var(--t3)", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        ▲ {post.upvotes}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Real leaderboard full */}
          <Card pad="none" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <CardHeader
              icon={<Trophy size={13} />}
              title="Classement"
              action={<SectionLabel>{lb?.total_users ?? 0} investisseurs</SectionLabel>}
            />
            <div style={{ padding: "10px 16px" }}>
              {leaderboard.isLoading ? (
                <div style={{ padding: 16, textAlign: "center" }}><LoadingSpinner size="sm" /></div>
              ) : !lb || lb.top.length === 0 ? (
                <div style={{ padding: "20px 4px", textAlign: "center", color: "var(--t3)", fontSize: "0.78rem", lineHeight: 1.5 }}>
                  Classement vide. Le premier investisseur avec un tracker démarre la course.
                </div>
              ) : (
                <>
                  {lb.top.map(row => (
                    <div key={row.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--card-border)" }}>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.78rem", fontWeight: 700, color: row.rank === 1 ? "var(--orange)" : "var(--t3)", minWidth: 22 }}>
                        {row.rank === 1 ? <Trophy size={12} style={{ display: "inline", verticalAlign: "middle" }} /> : `${row.rank}`}
                      </span>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(row.user_id), flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--t1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.display_name}</span>
                      <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{row.positions_count} pos.</span>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: row.return_pct >= 0 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}>
                        {fmtPct(row.return_pct, 1)}
                      </span>
                    </div>
                  ))}
                  {lb.me && !lb.top.find(r => r.user_id === lb.me?.user_id) && (
                    <div style={{ padding: "10px 0 4px", display: "flex", alignItems: "center", gap: 10, borderTop: "1px dashed var(--card-border)", marginTop: 4 }}>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.78rem", fontWeight: 700, color: "var(--orange)", minWidth: 22 }}>{lb.me.rank}</span>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--orange)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--orange)", fontWeight: 600 }}>Vous</span>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: lb.me.return_pct >= 0 ? "var(--green)" : "var(--red)", fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}>
                        {fmtPct(lb.me.return_pct, 1)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </section>

        {/* 3-col footer */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Eye size={12} style={{ color: "var(--orange)" }} />
              <h3 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "var(--t1)" }}>Tickers en discussion</h3>
            </div>
            <div style={{ padding: "4px 0" }}>
              {topMentionedTickers.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--t3)", fontSize: "0.74rem" }}>
                  Aucune mention récente.
                </div>
              ) : topMentionedTickers.map(([tk, count], i) => (
                <Link key={tk} href={`/equity?ticker=${tk}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", textDecoration: "none", borderBottom: "1px solid var(--card-border)" }}>
                  <span style={{ fontSize: "0.66rem", color: "var(--t3)", minWidth: 16 }}>{i + 1}</span>
                  <TickerLogo ticker={tk} size={20} />
                  <span style={{ flex: 1, fontFamily: "Manrope, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "var(--orange)" }}>{tk}</span>
                  <span style={{ fontSize: "0.66rem", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{count} mention{count > 1 ? "s" : ""}</span>
                </Link>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={12} style={{ color: "var(--orange)" }} />
              <h3 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "var(--t1)" }}>Actualités</h3>
            </div>
            <div style={{ padding: "4px 0" }}>
              {news.isLoading ? (
                <div style={{ padding: 16, textAlign: "center" }}><LoadingSpinner size="sm" /></div>
              ) : (news.data?.news ?? []).slice(0, 5).map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", padding: "10px 18px", borderBottom: "1px solid var(--card-border)", textDecoration: "none" }}>
                  <p style={{ fontSize: "0.74rem", color: "var(--t1)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {n.title}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{n.publisher}</span>
                    <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>·</span>
                    <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{timeAgo(n.published)}</span>
                    <ExternalLink size={9} style={{ color: "var(--t3)", marginLeft: "auto" }} />
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Bell size={12} style={{ color: "var(--orange)" }} />
              <h3 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "var(--t1)" }}>Vos alertes</h3>
              <Link href="/alerts" style={{ fontSize: "0.62rem", color: "var(--orange)", textDecoration: "none", marginLeft: "auto" }}>Gérer →</Link>
            </div>
            <div style={{ padding: 18, fontSize: "0.78rem", color: "var(--t3)", textAlign: "center", lineHeight: 1.5 }}>
              Aucune alerte déclenchée aujourd&apos;hui.
              <br />
              <Link href="/alerts" style={{ color: "var(--orange)", fontSize: "0.72rem" }}>Créer une alerte</Link>
            </div>
          </div>
        </section>

      </div>

      {/* ── QR Performance share modal ── */}
      {(() => {
        const pfName = trackerResult
          ? (trackerPortfolios.find(p => p.id === selectedTrkId)?.name ?? "Tracker")
          : (optPortfolios.find(p => p.id === selectedOptId)?.name ?? "Portfolio");
        const returnPct = userReturn != null ? (userReturn * 100).toFixed(1) : "0";
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const shareUrl = `${origin}/share/performance?name=${encodeURIComponent(pfName)}&return=${returnPct}`;
        return (
          <QRShareModal
            open={qrPerfOpen}
            onClose={() => setQrPerfOpen(false)}
            url={shareUrl}
            title="Share Performance"
            subtitle={`${pfName} · ${returnPct >= "0" ? "+" : ""}${returnPct}%`}
          />
        );
      })()}
    </ErrorBoundary>
  );
}
