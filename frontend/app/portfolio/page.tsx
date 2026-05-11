"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { get, post, del } from "@/lib/api";
import type { OptimizationResult, MonteCarloResult, PerformanceResult } from "@/lib/types";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatPercent, formatCurrency, formatNumber } from "@/lib/utils";
import {
  Plus, Trash2, Play, BarChart2, Save, FolderOpen, X,
  ChevronDown, ChevronUp, TrendingUp, Activity, Target, Lock,
  Sparkles, Shield, Zap,
} from "lucide-react";
import ShareButton from "@/components/ShareButton";
import { Card, CardHeader, KpiCard, SectionLabel } from "@/components/ui/Card";
import TickerLogo from "@/components/ui/TickerLogo";
import toast from "react-hot-toast";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { usePlan } from "@/lib/plan";
import { useInvestorMode, SIMPLE_RISK_METHODS } from "@/lib/investorMode";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------
type Tab = "optimize" | "montecarlo" | "compare" | "performance";

const OptSchema = z.object({
  tickerInput: z.string(),
  method: z.string(),
  capital: z.number().min(100).max(1_000_000_000),
  min_weight: z.number().min(0).max(1),
  max_weight: z.number().min(0).max(1),
  risk_aversion: z.number().min(0.1).max(10),
  max_assets: z.number().int().min(2).max(50).nullable(),
});
type OptForm = z.infer<typeof OptSchema>;

interface SavedPortfolio {
  id: string;
  name: string;
  tickers: string[];
  weights: number[];
  method: string;
  capital: number;
  result: OptimizationResult | null;
  savedAt: string;
}

const METHODS = [
  { value: "HRP",          label: "HRP",           desc: "Hierarchical Risk Parity",     fullDesc: "Cluster-based risk budgeting. No return estimates needed — robust to estimation error. Best for diversification." },
  { value: "MeanVar",      label: "Mean-Variance",  desc: "Markowitz Efficient Frontier", fullDesc: "Maximises return per unit of risk. Can produce concentrated positions. Sensitive to input assumptions." },
  { value: "MinVol",       label: "Min Vol",        desc: "Minimum Volatility",           fullDesc: "Finds the lowest possible variance portfolio regardless of return. Defensive, capital-preservation focused." },
  { value: "EqualWeights", label: "Equal Weights",  desc: "Equal Weights",                fullDesc: "Splits capital equally across all assets. Simple, transparent, and surprisingly hard to beat long-term." },
];

const CHART_COLORS = [
  "#7AA7E8", "#86B38A", "#C9B178", "#D48585", "#A97CC0",
  "#5BBCB8", "#E8A87C", "#7CA8D4", "#B5CC8E", "#D4A5A5",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PortfolioPage() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { plan, canUseMethod, canAddPortfolio } = usePlan();
  const { mode, profile, recommendations, openProfileModal } = useInvestorMode();
  const isSimple = mode === "simple";
  const isDark = theme === "dark";

  const [simpleRisk, setSimpleRisk] = useState<"conservative" | "balanced" | "aggressive">(
    (profile?.risk as "conservative" | "balanced" | "aggressive") ?? "balanced"
  );

  const [activeTab, setActiveTab]             = useState<Tab>("optimize");
  const [tickers, setTickers]                 = useState<string[]>([]);
  const [topScoredPct, setTopScoredPct]       = useState<number>(20);
  const [optResult, setOptResult]             = useState<OptimizationResult | null>(null);
  const [mcResult, setMcResult]               = useState<MonteCarloResult | null>(null);
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [saveModalOpen, setSaveModalOpen]     = useState(false);
  const [saveNameInput, setSaveNameInput]     = useState("");
  const [loadPanelOpen, setLoadPanelOpen]     = useState(false);
  const [compareSel, setCompareSel]           = useState<string[]>([]);
  const [comparingIds, setComparingIds]       = useState<Set<string>>(new Set());
  const [configOpen, setConfigOpen]           = useState(true);
  const [useTopScored, setUseTopScored]       = useState(true);
  const [perfPortfolioId, setPerfPortfolioId] = useState<string>("");
  const [perfStartDate, setPerfStartDate]     = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  });
  const [perfResult, setPerfResult] = useState<PerformanceResult | null>(null);

  // DCA calculator state
  const [dcaAmount, setDcaAmount] = useState<number>(500);
  const [dcaFreq, setDcaFreq]     = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");
  const [dcaIter, setDcaIter]     = useState<number>(24);

  // Load portfolios from backend (user-scoped)
  useEffect(() => {
    get<{ name: string; tickers: string[]; weights: number[]; capital: number; method: string; created_at: string }[]>(
      "/portfolio/saved"
    )
      .then((rows) => {
        setSavedPortfolios(
          rows.map((r) => ({
            id: r.name,
            name: r.name,
            tickers: r.tickers,
            weights: r.weights,
            method: r.method,
            capital: r.capital,
            result: null,
            savedAt: r.created_at,
          }))
        );
      })
      .catch(() => {}); // not logged in yet or backend down
  }, []);

  const { register, handleSubmit, watch, setValue, getValues } = useForm<OptForm>({
    resolver: zodResolver(OptSchema),
    defaultValues: {
      tickerInput: "",
      method: "HRP",
      capital: 20000,
      min_weight: 0.01,
      max_weight: 0.40,
      risk_aversion: 1.0,
      max_assets: null,
    },
  });

  const watchedMethod = watch("method");

  // If current method is locked by the user's plan, switch to first allowed.
  useEffect(() => {
    if (!canUseMethod(watchedMethod)) {
      const firstAllowed = METHODS.find((m) => canUseMethod(m.value));
      if (firstAllowed) setValue("method", firstAllowed.value);
    }
  }, [watchedMethod, canUseMethod, setValue]);

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------
  const buildMcPayload = (opt: OptimizationResult) => {
    const userTickers = tickers.filter((t) => t !== "TOP20");
    const optTickers  = Object.keys(opt.weights);
    const allTickers  = [...new Set([...optTickers, ...userTickers])];
    const rawWeights  = allTickers.map((t) => opt.weights[t] ?? 0);
    const totalW      = rawWeights.reduce((a, b) => a + b, 0);
    const weights     = totalW > 0 ? rawWeights.map((w) => w / totalW)
      : allTickers.map(() => 1 / allTickers.length);
    const capital     = opt.allocation_eur
      ? Object.values(opt.allocation_eur).reduce((a, b) => a + b, 0) : 20000;
    return { tickers: allTickers, weights, capital, n_simulations: 1000, horizon_days: 252 };
  };

  const optimize = useMutation({
    mutationFn: (data: OptForm) => {
      let payloadTickers = useTopScored && !tickers.includes("TOP20")
        ? [...tickers, "TOP20"] : tickers;
      if (payloadTickers.length === 1 && payloadTickers[0] === "TOP20")
        payloadTickers = ["TOP20", "TOP20"];
      return post<OptimizationResult>("/portfolio/optimize", {
        tickers: payloadTickers, method: data.method, capital: data.capital,
        min_weight: data.min_weight, max_weight: data.max_weight,
        risk_aversion: data.risk_aversion, max_assets: data.max_assets ?? undefined,
        top_scored_pct: topScoredPct,
      });
    },
    onSuccess: (data) => {
      setOptResult(data);
      setMcResult(null);
      toast.success("Optimization complete — running Monte Carlo…");
      monteCarlo.mutate(data);
    },
    onError: (e: Error) => toast.error(e.message || "Optimization failed."),
  });

  const monteCarlo = useMutation({
    mutationFn: (overrideOpt?: OptimizationResult) => {
      const opt = overrideOpt ?? optResult;
      if (!opt) throw new Error("Run optimization first.");
      return post<MonteCarloResult>("/portfolio/monte-carlo", buildMcPayload(opt));
    },
    onSuccess: (data) => { setMcResult(data); },
    onError: () => toast.error("Monte Carlo failed."),
  });

  const performance = useMutation({
    mutationFn: () => {
      const pf = savedPortfolios.find((p) => p.id === perfPortfolioId);
      if (!pf) throw new Error("Select a portfolio.");
      // Use saved weights directly — no need to re-run optimization
      const pfTickers = pf.result ? Object.keys(pf.result.weights) : pf.tickers;
      const pfWeights = pf.result
        ? pfTickers.map((t) => pf.result!.weights[t])
        : (pf.weights?.length === pf.tickers.length
            ? pf.weights
            : pf.tickers.map(() => 1 / pf.tickers.length));
      return post<PerformanceResult>("/portfolio/performance", {
        tickers: pfTickers, weights: pfWeights, capital: pf.capital, start_date: perfStartDate,
      });
    },
    onSuccess: (data) => { setPerfResult(data); toast.success("Performance data loaded."); },
    onError: (e: Error) => toast.error(e.message || "Performance tracking failed."),
  });

  const compareOptimize = useMutation({
    mutationFn: (pf: SavedPortfolio) =>
      post<OptimizationResult>("/portfolio/optimize", {
        tickers: pf.tickers,
        method: pf.method,
        capital: pf.capital,
        min_weight: 0.01,
        max_weight: 0.40,
        risk_aversion: 1.0,
      }),
    onSuccess: (data, pf) => {
      setSavedPortfolios(prev => prev.map(p =>
        p.id === pf.id ? { ...p, result: data } : p
      ));
      setComparingIds(prev => { const s = new Set(prev); s.delete(pf.id); return s; });
    },
    onError: (_, pf) => {
      setComparingIds(prev => { const s = new Set(prev); s.delete(pf.id); return s; });
      toast.error(`Failed to load results for ${pf.name}`);
    },
  });

  // --------------------------------------------------------------------------
  // Ticker management
  // --------------------------------------------------------------------------
  const addTicker = (input: string) => {
    const t = input.trim().toUpperCase();
    if (!t || tickers.includes(t)) return;
    setTickers((prev) => [...prev, t]);
  };
  const removeTicker = (t: string) => setTickers((prev) => prev.filter((x) => x !== t));
  const handleTemplateSelect = useCallback((tmpl: PortfolioTemplate) => {
    setTickers(tmpl.tickers);
    setValue("method", tmpl.method as never);
  }, [setTickers, setValue]);

  // --------------------------------------------------------------------------
  // Portfolio save / load — all server-side, user-scoped
  // --------------------------------------------------------------------------
  const [saving, setSaving] = useState(false);

  const savePortfolio = async () => {
    const name = saveNameInput.trim();
    if (!name) { toast.error("Enter a portfolio name."); return; }
    if (!optResult) { toast.error("Run optimization before saving."); return; }
    const formValues = getValues();
    const weights = Object.values(optResult.weights);
    const wtickers = Object.keys(optResult.weights);
    setSaving(true);
    try {
      await post("/portfolio/save", {
        name,
        tickers: wtickers,
        weights,
        capital: formValues.capital,
        method: formValues.method,
      });
      const pf: SavedPortfolio = {
        id: name, name, tickers: wtickers,
        weights,
        method: formValues.method, capital: formValues.capital,
        result: optResult, savedAt: new Date().toISOString(),
      };
      setSavedPortfolios((prev) => [pf, ...prev.filter((p) => p.name !== name)]);
      setSaveModalOpen(false);
      setSaveNameInput("");
      toast.success(`"${name}" saved.`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Failed to save portfolio.";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const loadPortfolio = (pf: SavedPortfolio) => {
    setTickers(pf.tickers);
    setValue("method", pf.method as OptForm["method"]);
    setValue("capital", pf.capital);
    setOptResult(pf.result);
    setLoadPanelOpen(false);
    toast.success(`Loaded "${pf.name}" — re-run optimization to get metrics.`);
  };

  const deletePortfolio = async (name: string) => {
    try {
      await del(`/portfolio/saved/${encodeURIComponent(name)}`);
      setSavedPortfolios((prev) => prev.filter((p) => p.name !== name));
      toast.success("Portfolio deleted.");
    } catch {
      toast.error("Failed to delete portfolio.");
    }
  };

  // --------------------------------------------------------------------------
  // Chart data
  // --------------------------------------------------------------------------
  // table row visibility state
  const [allocShowAll, setAllocShowAll] = useState(false);
  const [dcaShowAll, setDcaShowAll]     = useState(false);
  const TABLE_PAGE = 8;

  const mcData = mcResult ? buildMcChartData(mcResult) : [];

  const comparePortfolios = savedPortfolios.filter((p) => compareSel.includes(p.id) && p.result);
  const compareData = comparePortfolios.map((pf, i) => ({
    type: "bar" as const,
    name: pf.name,
    x: ["Return %", "Volatility %", "Sharpe", "Sortino", "Calmar", "Beta"],
    y: [
      pf.result!.metrics.expected_annual_return * 100,
      pf.result!.metrics.annual_volatility * 100,
      pf.result!.metrics.sharpe_ratio,
      pf.result!.metrics.sortino_ratio ?? 0,
      pf.result!.metrics.calmar_ratio ?? 0,
      pf.result!.metrics.beta ?? 0,
    ],
    marker: { color: CHART_COLORS[i % CHART_COLORS.length] },
  }));

  const gridCol = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const axisCol = isDark ? "rgba(245,245,245,0.30)" : "rgba(17,17,17,0.45)";
  const paperBg = "rgba(0,0,0,0)";

  // MC-derived forward-looking metrics (GBM average over 1000 simulations)
  const mcMetrics = useMemo(() => {
    if (!mcResult) return null;
    const capital    = mcResult.initial_capital;
    const p95_last   = mcResult.percentiles.p95[mcResult.percentiles.p95.length - 1];
    const p5_last    = mcResult.percentiles.p5[mcResult.percentiles.p5.length - 1];
    const mc_return  = (mcResult.risk_metrics.expected_final_value / capital) - 1;
    // GBM implied vol: sigma = ln(P95 / P5) / (2 x 1.645) for 1-year horizon
    const mc_vol     = Math.log(Math.max(p95_last, 1e-9) / Math.max(p5_last, 1e-9)) / (2 * 1.645);
    const mc_sharpe  = mc_vol > 0 ? (mc_return - 0.03) / mc_vol : 0;
    // Downside vol from VaR: sigma_d approx VaR_95 / (capital x 1.645)
    const mc_sortino = mcResult.risk_metrics.var_95 > 0
      ? (mc_return - 0.03) / (mcResult.risk_metrics.var_95 / capital / 1.645) : 0;
    const mc_worst   = (mcResult.risk_metrics.worst_case_p5 / capital) - 1;
    return { mc_return, mc_vol, mc_sharpe, mc_sortino, mc_worst };
  }, [mcResult]);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div
        className="fade-in"
        style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto", fontFamily: "Manrope, DM Sans, sans-serif" }}
      >

        {/* ── Page header ── */}
        <div
          style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, paddingBottom: 20, borderBottom: "1px solid var(--card-border)", marginBottom: 24 }}
        >
          <div>
            <h1 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
              Portfolio Allocation
            </h1>
            <p style={{ fontSize: "0.78rem", color: "var(--t3)", marginTop: 5, maxWidth: 560, lineHeight: 1.5 }}>
              Construct, analyze, and optimize institutional-grade portfolios with multi-asset class precision and risk constraints.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => { setTickers([]); setValue("method", "HRP"); setValue("capital", 20000); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: "0.72rem", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", color: "var(--t2)", background: "var(--bg-card)", cursor: "pointer" }}
            >
              <X size={11} />
              Clear All
            </button>
            <button
              onClick={() => {
                const val = watch("tickerInput");
                if (val) { addTicker(val); setValue("tickerInput", ""); }
              }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: "0.72rem", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", color: "var(--t2)", background: "var(--bg-card)", cursor: "pointer" }}
            >
              <Plus size={11} />
              + Add Asset
            </button>
            <button
              onClick={() => setLoadPanelOpen((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: "0.72rem", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", color: "var(--t2)", background: "var(--bg-card)", cursor: "pointer" }}
            >
              <FolderOpen size={12} />
              {savedPortfolios.length > 0 ? `${savedPortfolios.length} saved` : "Load"}
            </button>
            <button
              onClick={() => { setSaveNameInput(""); setSaveModalOpen(true); }}
              disabled={!optResult}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: "0.72rem", borderRadius: "var(--r-md)", fontWeight: 600, background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff", cursor: !optResult ? "not-allowed" : "pointer", opacity: !optResult ? 0.4 : 1, border: "none" }}
            >
              <Save size={12} />
              Save
            </button>
            {optResult && (
              <ShareButton
                label={`Allocation ${watchedMethod || ""}`.trim()}
                tickers={Object.keys(optResult.weights)}
                weights={Object.values(optResult.weights)}
                method={watchedMethod}
                variant="compact"
                text="Partager"
              />
            )}
          </div>
        </div>

        {/* ── Load panel ── */}
        {loadPanelOpen && (
          <div
            style={{ marginBottom: 20, background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}
          >
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}
            >
              <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                Saved Portfolios
              </span>
              <button onClick={() => setLoadPanelOpen(false)} style={{ color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }}>
                <X size={13} />
              </button>
            </div>
            {savedPortfolios.length === 0 ? (
              <p style={{ padding: "16px 20px", fontSize: "0.72rem", color: "var(--t3)" }}>No saved portfolios.</p>
            ) : (
              <div>
                {savedPortfolios.map((pf) => (
                  <div key={pf.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                    <div>
                      <p style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--t1)" }}>{pf.name}</p>
                      <p style={{ fontSize: "0.7rem", marginTop: 2, color: "var(--t3)" }}>
                        {pf.method} · {pf.tickers.join(", ")} · {pf.capital.toLocaleString()}€
                      </p>
                      {pf.result && (
                        <p style={{ fontSize: "0.7rem", marginTop: 2, color: "var(--t2)" }}>
                          Sharpe {formatNumber(pf.result.metrics.sharpe_ratio, 2)} ·{" "}
                          <span style={{ color: "var(--green)" }}>
                            {formatPercent(pf.result.metrics.expected_annual_return)}
                          </span>{" "}
                          · Vol {formatPercent(pf.result.metrics.annual_volatility)}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => loadPortfolio(pf)}
                        style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--orange)", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Load
                      </button>
                      <ShareButton
                        label={pf.name}
                        tickers={pf.tickers}
                        weights={pf.weights}
                        method={pf.method}
                        variant="compact"
                        text="Partager"
                      />
                      <button onClick={() => deletePortfolio(pf.name)} style={{ color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 1-Click Templates ── */}
        <PortfolioTemplates onSelect={handleTemplateSelect} />

        {/* ════════════════════════════════════════════════
            STRATEGY CONSTRUCTION — two-column layout
        ════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginTop: 20, alignItems: "start" }}>

          {/* ── Left: Strategy Construction panel — dark institutional panel ── */}
          <Card variant="dark" pad="none" style={{ overflow: "hidden" }}>
            <CardHeader
              title="Strategy Construction"
              icon={<Target size={13} />}
              bordered
            />

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>

              {/* ── Section: Asset Universe ── */}
              <div>
                <SectionLabel style={{ marginBottom: 10 }}>Asset Universe</SectionLabel>
                {/* Global Asset Search */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      {...register("tickerInput")}
                      placeholder="Search ticker — e.g. AAPL, MSFT, GOOG"
                      style={{ flex: 1, fontSize: "0.8rem", padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", textTransform: "uppercase" }}
                      className="placeholder:normal-case placeholder:opacity-50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTicker((e.target as HTMLInputElement).value);
                          setValue("tickerInput", "");
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => { addTicker(watch("tickerInput")); setValue("tickerInput", ""); }}
                      style={{ padding: "8px 14px", borderRadius: "var(--r-md)", background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff", border: "none", cursor: "pointer", fontWeight: 600 }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>

                {/* Active Basket */}
                <div>
                  <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
                    Active Basket{tickers.length > 0 ? ` (${tickers.length})` : ""}
                  </p>
                  {tickers.length === 0 && !useTopScored ? (
                    <Card variant="ghost" pad="md">
                      <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--t2)", margin: 0, fontFamily: "Manrope, DM Sans, sans-serif" }}>
                        Aucun actif
                      </p>
                      <p style={{ fontSize: "0.7rem", color: "var(--t3)", margin: "3px 0 0 0", lineHeight: 1.5 }}>
                        Ajoutez un ticker via la recherche, ou choisissez un modèle.
                      </p>
                    </Card>
                  ) : (
                    <Card variant="inner" pad="md" style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 36, alignItems: "center" }}>
                      {tickers.map((tk) => {
                        const w = optResult?.weights[tk];
                        return (
                          <span
                            key={tk}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: "var(--r-full)", border: "1px solid var(--orange-border)", background: "var(--orange-dim)", fontSize: "0.72rem", fontWeight: 600, color: "var(--orange)", fontVariantNumeric: "tabular-nums" }}
                          >
                            {tk}
                            {w !== undefined && (
                              <span style={{ fontSize: "0.65rem", color: "var(--t3)", fontWeight: 400 }}>{formatPercent(w)}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeTicker(tk)}
                              style={{ color: "var(--t3)", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}
                            >
                              <X size={9} />
                            </button>
                          </span>
                        );
                      })}
                      {useTopScored && (
                        <span
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", fontSize: "0.72rem", color: "var(--t3)" }}
                        >
                          + TOP {topScoredPct}%
                        </span>
                      )}
                    </Card>
                  )}
                </div>

                {/* Top Scored toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.73rem", color: "var(--t2)", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={useTopScored}
                      onChange={(e) => setUseTopScored(e.target.checked)}
                      style={{ width: 14, height: 14, borderRadius: 4 }}
                    />
                    Include Top Scored Assets
                  </label>
                  {useTopScored && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number" min={1} max={100}
                        value={topScoredPct}
                        onChange={(e) => setTopScoredPct(Math.min(100, Math.max(1, Number(e.target.value))))}
                        style={{ width: 52, fontSize: "0.75rem", padding: "4px 6px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", textAlign: "center" }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section: Capital ── */}
              <div>
                <SectionLabel style={{ marginBottom: 10 }}>Capital</SectionLabel>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: "1rem", fontWeight: 700, color: "var(--t3)", pointerEvents: "none", fontFamily: "Manrope, DM Sans, sans-serif" }}>€</span>
                  <input
                    type="number" min={100} step={100}
                    {...register("capital", { valueAsNumber: true })}
                    style={{ width: "100%", fontSize: "1.25rem", fontWeight: 700, fontFamily: "Manrope, DM Sans, sans-serif", padding: "12px 14px 12px 30px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", boxSizing: "border-box", letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}
                  />
                </div>
              </div>

              {/* ── Section: Optimization Method ── */}
              <div>
                <SectionLabel style={{ marginBottom: 10 }}>Optimization Method</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {METHODS.map((m) => {
                    const active = watchedMethod === m.value;
                    const locked = !canUseMethod(m.value);
                    return (
                      <button
                        key={m.value}
                        type="button"
                        disabled={locked}
                        onClick={() => { if (!locked) setValue("method", m.value); }}
                        title={locked ? "Locked — upgrade plan" : m.desc}
                        style={{
                          height: 26,
                          padding: "0 10px",
                          borderRadius: "var(--r-md)",
                          border: active ? "none" : "1px solid var(--card-border)",
                          background: active ? "var(--orange)" : "var(--bg-inner)",
                          color: active ? (isDark ? "#0A0A0A" : "#ffffff") : locked ? "var(--t3)" : "var(--t2)",
                          fontSize: "0.72rem",
                          fontWeight: active ? 700 : 500,
                          fontFamily: "Manrope, DM Sans, sans-serif",
                          cursor: locked ? "not-allowed" : "pointer",
                          opacity: locked ? 0.45 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          transition: "background 0.12s, color 0.12s",
                          letterSpacing: "0.01em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {locked && <Lock size={9} />}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const m = METHODS.find(x => x.value === watchedMethod);
                  return m ? (
                    <p style={{ fontSize: "0.67rem", color: "var(--t3)", marginTop: 7, lineHeight: 1.45 }}>{m.desc}</p>
                  ) : null;
                })()}
              </div>

              {/* ── Section: Risk Constraints ── */}
              <div>
                <SectionLabel style={{ marginBottom: 10 }}>Risk Constraints</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.63rem", color: "var(--t3)", marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" }}>Min Weight</label>
                    <input type="number" step={0.01} {...register("min_weight", { valueAsNumber: true })}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "7px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.63rem", color: "var(--t3)", marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" }}>Max Weight</label>
                    <input type="number" step={0.01} {...register("max_weight", { valueAsNumber: true })}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "7px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.63rem", color: "var(--t3)", marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" }}>Risk Aversion</label>
                    <input type="number" step={0.1} {...register("risk_aversion", { valueAsNumber: true })}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "7px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.63rem", color: "var(--t3)", marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" }}>Max Assets</label>
                    <input type="number" min={2} max={50} step={1} placeholder="All"
                      {...register("max_assets", { setValueAs: (v) => (v === "" || v === null) ? null : Number(v) })}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "7px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-inner)", color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Plan warnings */}
              {plan === "free" && (
                <p style={{ fontSize: "0.72rem", color: "var(--t3)", marginTop: -8 }}>
                  Free plan — only Equal Weights available.{" "}
                  <Link href="/account" style={{ color: "var(--orange)" }}>Upgrade →</Link>
                </p>
              )}
              {plan === "pro" && (
                <p style={{ fontSize: "0.72rem", color: "var(--t3)", marginTop: -8 }}>
                  HRP locked — included in Institutional plan.{" "}
                  <Link href="/account" style={{ color: "var(--orange)" }}>Upgrade →</Link>
                </p>
              )}

              {/* ── Run button ── */}
              <form id="opt-form" onSubmit={handleSubmit((d) => optimize.mutate(d))}>
                {(() => {
                  const tooFew = tickers.length < 2 && !useTopScored;
                  const disabled = optimize.isPending || tooFew;
                  return (
                    <>
                      <button
                        type="submit"
                        disabled={disabled}
                        title={tooFew ? "2 actifs minimum" : undefined}
                        style={{ width: "100%", padding: "12px 0", borderRadius: "var(--r-md)", background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff", border: "none", fontSize: "0.85rem", fontWeight: 700, fontFamily: "Manrope, DM Sans, sans-serif", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.03em" }}
                      >
                        {optimize.isPending ? <LoadingSpinner size="sm" /> : <Play size={13} />}
                        {optimize.isPending ? "Optimisation…" : "Run Simulation"}
                      </button>
                      {tooFew && (
                        <p style={{ fontSize: "0.68rem", color: "var(--t3)", marginTop: 8, textAlign: "center" }}>
                          2 actifs minimum
                        </p>
                      )}
                    </>
                  );
                })()}
              </form>
            </div>
          </Card>

          {/* ── Right: Risk sidebar — dark contrast Scorer-style ── */}
          <Card variant="dark" pad="none" style={{ overflow: "hidden" }}>
            <CardHeader
              title="Risk"
              icon={<Shield size={13} />}
              bordered
            />

            <div style={{ padding: "20px" }}>
              {optimize.isPending ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120 }}>
                  <LoadingSpinner label="Computing…" size="lg" />
                </div>
              ) : optResult ? (
                <>
                  {/* 3 key KPI tiles, varied */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                    <KpiCard
                      variant="inner"
                      label={mcMetrics ? "Expected Return (10Y, MC)" : "Expected Return (10Y)"}
                      value={formatPercent(mcMetrics ? mcMetrics.mc_return : optResult.metrics.expected_annual_return)}
                      accent="green"
                    >
                      {mcMetrics && (
                        <span style={{ alignSelf: "flex-start", fontSize: "0.6rem", padding: "1px 6px", borderRadius: "var(--r-full)", background: "var(--orange-dim)", color: "var(--orange)", fontWeight: 600 }}>
                          GBM
                        </span>
                      )}
                    </KpiCard>
                    <KpiCard
                      variant="inner"
                      label={mcMetrics ? "Volatility Ann. (MC)" : "Volatility (Ann.)"}
                      value={formatPercent(mcMetrics ? mcMetrics.mc_vol : optResult.metrics.annual_volatility)}
                      accent="neutral"
                      hint="Annualized standard deviation"
                    />
                    <KpiCard
                      variant="inner"
                      label={mcMetrics ? "Sharpe Ratio (MC)" : "Sharpe Ratio"}
                      value={formatNumber(mcMetrics ? mcMetrics.mc_sharpe : optResult.metrics.sharpe_ratio, 3)}
                      accent="orange"
                    />
                  </div>

                  {/* Secondary metrics — denser grid */}
                  <SectionLabel style={{ marginBottom: 8 }}>Secondary</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { label: "Sortino", value: formatNumber(mcMetrics ? mcMetrics.mc_sortino : optResult.metrics.sortino_ratio, 3), color: "var(--orange)" },
                      { label: "Calmar", value: formatNumber(optResult.metrics.calmar_ratio, 3), color: "var(--orange)" },
                      { label: "Beta vs S&P", value: formatNumber(optResult.metrics.beta, 3), color: "var(--t2)" },
                      { label: "Max Drawdown", value: formatPercent(mcMetrics ? mcMetrics.mc_worst : optResult.metrics.max_drawdown), color: "var(--red)" },
                    ].map((m) => (
                      <Card key={m.label} variant="inner" pad="sm">
                        <p style={{ fontSize: "0.62rem", color: "var(--t3)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</p>
                        <p style={{ fontSize: "0.9rem", fontWeight: 600, color: m.color, fontVariantNumeric: "tabular-nums", margin: 0 }}>{m.value}</p>
                      </Card>
                    ))}
                  </div>

                  {monteCarlo.isPending && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", fontSize: "0.72rem", color: "var(--orange)" }}>
                      <LoadingSpinner size="sm" />
                      Running 1 000 simulations…
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 8 }}>
                  <TrendingUp size={24} style={{ color: "var(--t3)" }} />
                  <p style={{ fontSize: "0.72rem", color: "var(--t3)", textAlign: "center" }}>
                    Run a simulation to see risk metrics.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 0, marginTop: 28, borderBottom: "1px solid var(--card-border)" }}>
          {(["optimize", "montecarlo", "compare", "performance"] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              style={{ paddingBottom: 12, paddingLeft: 4, paddingRight: 4, marginRight: 28, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `2px solid ${activeTab === tabKey ? "var(--orange)" : "transparent"}`, marginBottom: -1, color: activeTab === tabKey ? "var(--orange)" : "var(--t3)", fontWeight: activeTab === tabKey ? 600 : 400, background: "none", border: "none", borderBottomStyle: "solid", borderBottomWidth: 2, borderBottomColor: activeTab === tabKey ? "var(--orange)" : "transparent", cursor: "pointer" }}
            >
              {t.portfolio.tabs[tabKey]}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════
            OPTIMIZE TAB
        ════════════════════════════════════════════════ */}
        {activeTab === "optimize" && (
          <div style={{ paddingTop: 20 }}>
            {optimize.isPending && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 208 }}>
                <LoadingSpinner label="Optimizing portfolio…" size="lg" />
              </div>
            )}

            {optResult && !optimize.isPending && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* ── Sector Exposure + Geographic Diversification donuts ── */}
                {optResult.diversification && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <DonutChart title="Sector Exposure" data={optResult.diversification.sectors} />
                    <DonutChart title="Geographic Diversification" data={optResult.diversification.countries} />
                  </div>
                )}

                {/* ── Portfolio Constituents table ── */}
                <div style={{ border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                    <Target size={13} style={{ color: "var(--orange)" }} />
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                      Portfolio Constituents — {optResult.method}
                    </span>
                  </div>
                  {(() => {
                    const allRows = Object.entries(optResult.weights).sort(([, a], [, b]) => b - a);
                    const rows = allocShowAll ? allRows : allRows.slice(0, TABLE_PAGE);
                    const totalCapital = Object.values(optResult.allocation_eur ?? {}).reduce((a, b) => a + b, 0);
                    return (
                      <>
                        <table style={{ width: "100%", fontSize: "0.75rem", background: "var(--bg-card)", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                              {["Ticker", "Asset Name", "Weight (%)", "Allocation (EUR)", "Distribution"].map((h) => (
                                <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", fontSize: "0.62rem" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(([tk, w], i) => (
                              <tr key={tk} style={{ borderBottom: "1px solid var(--card-border)" }}>
                                <td style={{ padding: "10px 20px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <TickerLogo ticker={tk} size={22} />
                                    <span style={{ fontWeight: 700, color: "var(--t1)", fontSize: "0.78rem" }}>{tk}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "10px 20px", color: "var(--t3)", fontSize: "0.72rem" }}>
                                  {tk.replace(/[-.].*/, "")}
                                </td>
                                <td style={{ padding: "10px 20px", color: "var(--orange)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatPercent(w)}</td>
                                <td style={{ padding: "10px 20px", color: "var(--t2)", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(optResult.allocation_eur?.[tk] ?? 0)}</td>
                                <td style={{ padding: "10px 20px", width: 140 }}>
                                  <div style={{ borderRadius: 999, overflow: "hidden", height: 4, background: "var(--card-border)" }}>
                                    <div style={{ width: `${Math.min(w * 100, 100)}%`, height: "100%", borderRadius: 999, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {allRows.length > TABLE_PAGE && (
                          <button
                            onClick={() => setAllocShowAll((v) => !v)}
                            style={{ width: "100%", padding: "10px 0", fontSize: "0.72rem", background: "var(--bg-card)", color: "var(--t3)", border: "none", borderTop: "1px solid var(--card-border)", cursor: "pointer" }}
                          >
                            {allocShowAll ? `Show top ${TABLE_PAGE}` : `Show all ${allRows.length} assets`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* ── Weight distribution bar chart ── */}
                <div style={{ border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", background: "var(--bg-card)", overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                      Weight Distribution
                    </span>
                  </div>
                  <WeightBarChart weights={optResult.weights} />
                </div>

                {/* ── DCA Calculator ── */}
                {(() => {
                  const freqLabel: Record<string, string> = {
                    daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly",
                  };
                  const dcaRows = Object.entries(optResult.weights)
                    .sort(([, a], [, b]) => b - a)
                    .map(([ticker, w]) => {
                      const perPeriod = dcaAmount * w;
                      const total     = perPeriod * dcaIter;
                      return { ticker, w, perPeriod, total };
                    });
                  const grandTotal = dcaAmount * dcaIter;
                  return (
                    <div style={{ border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)", background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                          DCA Calculator
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: "0.7rem", color: "var(--t3)" }}>Amount / period</span>
                            <input
                              type="number" min={1} step={50} value={dcaAmount}
                              onChange={(e) => setDcaAmount(Math.max(1, Number(e.target.value)))}
                              style={{ fontSize: "0.72rem", padding: "4px 8px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", color: "var(--t1)", outline: "none", width: 72 }}
                            />
                            <span style={{ fontSize: "0.7rem", color: "var(--t3)" }}>€</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {(["daily", "weekly", "monthly", "quarterly"] as const).map((f) => (
                              <button
                                key={f}
                                onClick={() => setDcaFreq(f)}
                                style={{ padding: "4px 10px", borderRadius: "var(--r-md)", fontSize: "0.68rem", border: "1px solid", borderColor: dcaFreq === f ? "var(--orange-border)" : "var(--card-border)", background: dcaFreq === f ? "var(--orange-dim)" : "var(--bg-hover)", color: dcaFreq === f ? "var(--orange)" : "var(--t3)", cursor: "pointer" }}
                              >
                                {freqLabel[f]}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: "0.7rem", color: "var(--t3)" }}>Periods</span>
                            <input
                              type="number" min={1} max={1000} step={1} value={dcaIter}
                              onChange={(e) => setDcaIter(Math.max(1, Number(e.target.value)))}
                              style={{ fontSize: "0.72rem", padding: "4px 8px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", color: "var(--t1)", outline: "none", width: 56 }}
                            />
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const visRows = dcaShowAll ? dcaRows : dcaRows.slice(0, TABLE_PAGE);
                        return (
                          <>
                            <table style={{ width: "100%", fontSize: "0.75rem", background: "var(--bg-card)", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                                  {["Ticker", "Weight", `Per ${freqLabel[dcaFreq]} (€)`, `After ${dcaIter}x (€)`, "Distribution"].map((h) => (
                                    <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", fontSize: "0.62rem" }}>
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {visRows.map(({ ticker, w, perPeriod, total }, i) => (
                                  <tr key={ticker} style={{ borderBottom: "1px solid var(--card-border)" }}>
                                    <td style={{ padding: "10px 20px" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <TickerLogo ticker={ticker} size={20} />
                                        <span style={{ fontWeight: 700, color: "var(--t1)", fontSize: "0.76rem" }}>{ticker}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: "10px 20px", color: "var(--orange)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatPercent(w)}</td>
                                    <td style={{ padding: "10px 20px", color: "var(--t2)", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(perPeriod)}</td>
                                    <td style={{ padding: "10px 20px", color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(total)}</td>
                                    <td style={{ padding: "10px 20px", width: 140 }}>
                                      <div style={{ borderRadius: 999, overflow: "hidden", height: 4, background: "var(--card-border)" }}>
                                        <div style={{ width: `${Math.min(w * 100, 100)}%`, height: "100%", borderRadius: 999, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                <tr style={{ borderTop: "2px solid var(--card-border)" }}>
                                  <td colSpan={2} style={{ padding: "10px 20px", fontWeight: 600, fontSize: "0.72rem", color: "var(--t3)" }}>
                                    TOTAL ({dcaIter} {freqLabel[dcaFreq].toLowerCase()} periods)
                                  </td>
                                  <td style={{ padding: "10px 20px", fontWeight: 600, color: "var(--t1)" }}>{formatCurrency(dcaAmount)}</td>
                                  <td style={{ padding: "10px 20px", fontWeight: 600, color: "var(--green)" }}>{formatCurrency(grandTotal)}</td>
                                  <td />
                                </tr>
                              </tbody>
                            </table>
                            {dcaRows.length > TABLE_PAGE && (
                              <button
                                onClick={() => setDcaShowAll((v) => !v)}
                                style={{ width: "100%", padding: "10px 0", fontSize: "0.72rem", borderTop: "1px solid var(--card-border)", background: "var(--bg-card)", color: "var(--t3)", border: "none", cursor: "pointer" }}
                              >
                                {dcaShowAll ? `Show top ${TABLE_PAGE}` : `Show all ${dcaRows.length} assets`}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            )}

            {!optResult && !optimize.isPending && (
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 208, borderRadius: "var(--r-xl)", border: "1px dashed var(--card-border)", background: "var(--bg-card)", gap: 8, textAlign: "center" }}
              >
                <TrendingUp size={22} style={{ color: "var(--t3)" }} />
                <p style={{ fontSize: "0.75rem", color: "var(--t3)" }}>
                  Configure parameters above and run the simulation.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            RISK SIM TAB
        ════════════════════════════════════════════════ */}
        {activeTab === "montecarlo" && (
          <div style={{ paddingTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {!optResult ? (
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, borderRadius: "var(--r-xl)", border: "1px dashed var(--card-border)", background: "var(--bg-card)" }}
              >
                <p style={{ fontSize: "0.75rem", color: "var(--t3)" }}>
                  Run portfolio optimization first.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--t2)" }}>
                    {optResult.method} · {Object.keys(optResult.weights).length} assets · 1 000 simulations · 252 trading days
                  </p>
                  <button
                    onClick={() => monteCarlo.mutate(undefined)}
                    disabled={monteCarlo.isPending}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: "var(--r-md)", fontSize: "0.75rem", fontWeight: 600, background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff", border: "none", cursor: monteCarlo.isPending ? "not-allowed" : "pointer", opacity: monteCarlo.isPending ? 0.5 : 1 }}
                  >
                    {monteCarlo.isPending ? <LoadingSpinner size="sm" /> : <Activity size={12} />}
                    {monteCarlo.isPending ? "Simulating…" : "Run Monte Carlo"}
                  </button>
                </div>

                {monteCarlo.isPending && <SkeletonChart height={400} />}

                {mcResult && !monteCarlo.isPending && (
                  <>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}
                    >
                      {[
                        { label: "Expected Final Value", value: formatCurrency(mcResult.risk_metrics.expected_final_value), color: "var(--green)" },
                        { label: "VaR 95% (1Y)",         value: mcResult.risk_metrics.var_95 > 0 ? `-${formatCurrency(mcResult.risk_metrics.var_95)}` : "—",  color: "var(--red)" },
                        { label: "CVaR 95% (1Y)",        value: mcResult.risk_metrics.cvar_95 > 0 ? `-${formatCurrency(mcResult.risk_metrics.cvar_95)}` : "—", color: "var(--red)" },
                        { label: "Worst Case P5",        value: formatCurrency(mcResult.risk_metrics.worst_case_p5), color: "var(--yellow, #C9B178)" },
                      ].map((m, i) => (
                        <div
                          key={m.label}
                          style={{ padding: "16px 20px", background: "var(--bg-card)", borderRight: i < 3 ? "1px solid var(--card-border)" : "none" }}
                        >
                          <p style={{ fontSize: "0.7rem", marginBottom: 6, color: "var(--t3)" }}>{m.label}</p>
                          <p style={{ fontSize: "1rem", fontWeight: 600, color: m.color }}>{m.value}</p>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                          Simulation Fan Chart
                        </span>
                      </div>
                      <PlotlyChart card={false}
                        data={mcData}
                        layout={{
                          yaxis: { title: { text: "Portfolio Value (EUR)", font: { size: 10, color: axisCol } }, gridcolor: gridCol, color: axisCol },
                          xaxis: {
                            title: { text: "Trading Days", font: { size: 10, color: axisCol } },
                            gridcolor: gridCol,
                            color: axisCol,
                            range: mcResult.days.length > 0
                              ? [mcResult.days[0], mcResult.days[mcResult.days.length - 1]]
                              : undefined,
                            autorange: false,
                          },
                          paper_bgcolor: paperBg,
                          plot_bgcolor: paperBg,
                          margin: { l: 56, r: 16, t: 8, b: 40 },
                          legend: { orientation: "h", y: -0.2, font: { size: 10, color: axisCol } },
                        }}
                        height={420}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            COMPARE TAB
        ════════════════════════════════════════════════ */}
        {activeTab === "compare" && (
          <div style={{ paddingTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {savedPortfolios.length < 2 ? (
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, borderRadius: "var(--r-xl)", border: "1px dashed var(--card-border)", background: "var(--bg-card)" }}
              >
                <p style={{ fontSize: "0.75rem", color: "var(--t3)" }}>
                  Save at least 2 optimized portfolios to compare.
                </p>
              </div>
            ) : (
              <>
                <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                      Select Portfolios
                    </span>
                  </div>
                  <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {savedPortfolios.map((pf) => (
                      <button
                        key={pf.id}
                        onClick={() => {
                          const willBeSelected = !compareSel.includes(pf.id);
                          setCompareSel((prev) =>
                            prev.includes(pf.id) ? prev.filter((id) => id !== pf.id) : [...prev, pf.id]
                          );
                          if (willBeSelected && !pf.result) {
                            setComparingIds(prev => new Set([...prev, pf.id]));
                            compareOptimize.mutate(pf);
                          }
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: "0.72rem", borderRadius: "var(--r-md)", border: "1px solid", borderColor: compareSel.includes(pf.id) ? "var(--orange-border)" : "var(--card-border)", background: compareSel.includes(pf.id) ? "var(--orange-dim)" : "var(--bg-hover)", color: compareSel.includes(pf.id) ? "var(--orange)" : "var(--t2)", cursor: "pointer" }}
                      >
                        {comparingIds.has(pf.id) && <LoadingSpinner size="sm" />}
                        {pf.name}
                      </button>
                    ))}
                  </div>
                </div>

                {comparePortfolios.length >= 2 && (
                  <>
                    <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", overflow: "hidden" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                          Performance Comparison
                        </span>
                      </div>
                      <table style={{ width: "100%", fontSize: "0.75rem", background: "var(--bg-card)", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                            {["Portfolio", "Method", "Return", "Vol", "Sharpe", "Sortino", "Calmar", "Max DD", "Beta"].map((h) => (
                              <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", fontSize: "0.62rem" }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparePortfolios.map((pf, i) => (
                            <tr key={pf.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                              <td style={{ padding: "12px 16px", fontWeight: 500, color: CHART_COLORS[i % CHART_COLORS.length] }}>{pf.name}</td>
                              <td style={{ padding: "12px 16px", color: "var(--t2)" }}>{pf.method}</td>
                              <td style={{ padding: "12px 16px", color: "var(--green)" }}>{formatPercent(pf.result!.metrics.expected_annual_return)}</td>
                              <td style={{ padding: "12px 16px", color: "var(--yellow, #C9B178)" }}>{formatPercent(pf.result!.metrics.annual_volatility)}</td>
                              <td style={{ padding: "12px 16px", color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.sharpe_ratio, 3)}</td>
                              <td style={{ padding: "12px 16px", color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.sortino_ratio, 3)}</td>
                              <td style={{ padding: "12px 16px", color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.calmar_ratio, 3)}</td>
                              <td style={{ padding: "12px 16px", color: "var(--red)" }}>{formatPercent(pf.result!.metrics.max_drawdown)}</td>
                              <td style={{ padding: "12px 16px", color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.beta, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                          Grouped Metrics Chart
                        </span>
                      </div>
                      <PlotlyChart card={false}
                        data={compareData}
                        layout={{
                          barmode: "group",
                          yaxis: { gridcolor: gridCol, color: axisCol },
                          legend: { orientation: "h", y: -0.2, font: { size: 10, color: axisCol } },
                          paper_bgcolor: paperBg,
                          plot_bgcolor: paperBg,
                        }}
                        height={340}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TRACK PERFORMANCE TAB
        ════════════════════════════════════════════════ */}
        {activeTab === "performance" && (
          <div style={{ paddingTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
              <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                  Track Portfolio Performance
                </span>
              </div>
              <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "5fr 3fr 4fr", gap: 16, alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.68rem", color: "var(--t3)", marginBottom: 4 }}>Saved Portfolio</label>
                  {savedPortfolios.length === 0 ? (
                    <p style={{ fontSize: "0.72rem", color: "var(--t3)" }}>No saved portfolios.</p>
                  ) : (
                    <select
                      value={perfPortfolioId}
                      onChange={(e) => { setPerfPortfolioId(e.target.value); setPerfResult(null); }}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", color: "var(--t1)", outline: "none" }}
                    >
                      <option value="">— select —</option>
                      {savedPortfolios.map((pf) => (
                        <option key={pf.id} value={pf.id}>{pf.name} ({pf.method})</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.68rem", color: "var(--t3)", marginBottom: 4 }}>Start date</label>
                  <input
                    type="date"
                    value={perfStartDate}
                    onChange={(e) => { setPerfStartDate(e.target.value); setPerfResult(null); }}
                    style={{ width: "100%", fontSize: "0.8rem", padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", color: "var(--t1)", outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => performance.mutate()}
                    disabled={performance.isPending || !perfPortfolioId}
                    className="btn-primary"
                  >
                    {performance.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
                    {performance.isPending ? "Loading…" : "Track"}
                  </button>
                </div>
              </div>
            </div>

            {performance.isPending && <SkeletonChart height={380} />}

            {perfResult && !performance.isPending && (
              <>
                {(() => {
                  const pf = savedPortfolios.find((p) => p.id === perfPortfolioId);
                  const capital = pf?.capital ?? 0;
                  const pnl = perfResult.metrics.current_value - capital;
                  const nYears = perfResult.n_days / 252;
                  const cagr = nYears > 0
                    ? Math.pow(perfResult.metrics.current_value / Math.max(capital, 1), 1 / nYears) - 1
                    : 0;
                  const kpis = [
                    { label: "P&L (€)",       value: `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)}`,                   color: pnl >= 0 ? "var(--green)" : "var(--red)" },
                    { label: "Total Return",   value: formatPercent(perfResult.metrics.total_return),                    color: perfResult.metrics.total_return >= 0 ? "var(--green)" : "var(--red)" },
                    { label: "CAGR",           value: formatPercent(cagr),                                               color: cagr >= 0 ? "var(--green)" : "var(--red)" },
                    { label: "Current Value",  value: formatCurrency(perfResult.metrics.current_value),                  color: "var(--orange)" },
                    { label: "Max Drawdown",   value: formatPercent(perfResult.metrics.max_drawdown),                    color: "var(--red)" },
                    { label: "Duration",       value: `${perfResult.n_days}d`,                                           color: "var(--t2)" },
                  ];
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                      {kpis.map((m, i) => (
                        <div key={m.label} style={{ padding: "16px 20px", background: "var(--bg-card)", borderRight: i < kpis.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                          <p style={{ fontSize: "0.7rem", marginBottom: 6, color: "var(--t3)" }}>{m.label}</p>
                          <p style={{ fontSize: "1rem", fontWeight: 600, color: m.color }}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {perfResult.metrics.ann_return !== undefined && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                    {[
                      { label: "Ann. Return",     value: formatPercent(perfResult.metrics.ann_return!),     color: perfResult.metrics.ann_return! >= 0 ? "var(--green)" : "var(--red)" },
                      { label: "Ann. Volatility", value: formatPercent(perfResult.metrics.ann_volatility!), color: "var(--yellow, #C9B178)" },
                      { label: "Beta (vs SPY)",   value: perfResult.metrics.beta !== undefined ? formatNumber(perfResult.metrics.beta, 3) : "—", color: "var(--t1)" },
                    ].map((m, i) => (
                      <div key={m.label} style={{ padding: "16px 20px", background: "var(--bg-card)", borderRight: i < 2 ? "1px solid var(--card-border)" : "none" }}>
                        <p style={{ fontSize: "0.7rem", marginBottom: 6, color: "var(--t3)" }}>{m.label}</p>
                        <p style={{ fontSize: "1rem", fontWeight: 600, color: m.color }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {perfResult.metrics.sharpe_ratio !== undefined && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
                    {[
                      { label: "Sharpe Ratio",  value: formatNumber(perfResult.metrics.sharpe_ratio!, 4) },
                      { label: "Sortino Ratio", value: formatNumber(perfResult.metrics.sortino_ratio!, 4) },
                      { label: "Calmar Ratio",  value: formatNumber(perfResult.metrics.calmar_ratio!, 4) },
                    ].map((m, i) => (
                      <div key={m.label} style={{ padding: "16px 20px", background: "var(--bg-card)", borderRight: i < 2 ? "1px solid var(--card-border)" : "none" }}>
                        <p style={{ fontSize: "0.7rem", marginBottom: 6, color: "var(--t3)" }}>{m.label}</p>
                        <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--orange)" }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                      Portfolio vs SPY — since {perfStartDate} ({perfResult.n_days} trading days)
                    </span>
                  </div>
                  <PlotlyChart card={false}
                    data={[
                      {
                        type: "scatter", mode: "lines",
                        x: perfResult.dates, y: perfResult.portfolio_values,
                        name: savedPortfolios.find((p) => p.id === perfPortfolioId)?.name ?? "Portfolio",
                        line: { color: "#7AA7E8", width: 2 },
                        hovertemplate: "%{x}: %{y:,.0f}<extra></extra>",
                      },
                      {
                        type: "scatter", mode: "lines",
                        x: perfResult.dates, y: perfResult.benchmark_values,
                        name: "SPY",
                        line: { color: "#94A3B8", width: 1.5, dash: "dot" },
                        hovertemplate: "%{x}: %{y:,.0f}<extra></extra>",
                      },
                    ]}
                    layout={{
                      yaxis: { gridcolor: gridCol, color: axisCol },
                      xaxis: {
                        gridcolor: gridCol,
                        color: axisCol,
                        range: perfResult.dates.length > 0
                          ? [perfResult.dates[0], perfResult.dates[perfResult.dates.length - 1]]
                          : undefined,
                        autorange: false,
                      },
                      paper_bgcolor: paperBg,
                      plot_bgcolor: paperBg,
                      margin: { l: 56, r: 16, t: 8, b: 40 },
                      legend: { orientation: "h", y: -0.2, font: { size: 10, color: axisCol } },
                    }}
                    height={380}
                  />
                </div>

                {(() => {
                  const pf = savedPortfolios.find((p) => p.id === perfPortfolioId);
                  return pf?.result ? (
                    <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>
                          Composition at t = {perfStartDate}
                        </span>
                      </div>
                      <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {Object.entries(pf.result.weights)
                          .sort(([, a], [, b]) => b - a)
                          .map(([tk, w]) => (
                            <span
                              key={tk}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", fontSize: "0.72rem" }}
                            >
                              <span style={{ color: "var(--orange)", fontWeight: 600 }}>{tk}</span>
                              <span style={{ color: "var(--t3)" }}>{formatPercent(w)}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </>
            )}

            {!perfResult && !performance.isPending && (
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, borderRadius: "var(--r-xl)", border: "1px dashed var(--card-border)", background: "var(--bg-card)" }}
              >
                <p style={{ fontSize: "0.75rem", color: "var(--t3)" }}>
                  Select a portfolio and start date, then click Track.
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Save modal ── */}
      {saveModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <div
            style={{ width: 320, borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", padding: 24, background: "var(--bg-card)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, letterSpacing: "0.02em", color: "var(--t1)" }}>Save Portfolio</span>
              <button onClick={() => setSaveModalOpen(false)} style={{ color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.72rem", color: "var(--t3)", marginBottom: 4 }}>Portfolio name</label>
              <input
                autoFocus
                value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePortfolio()}
                placeholder="e.g. Tech Growth Q2"
                style={{ width: "100%", fontSize: "0.8rem", padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", background: "var(--bg-hover)", color: "var(--t1)", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {optResult && (
              <div style={{ borderRadius: "var(--r-md)", border: "1px solid var(--card-border)", overflow: "hidden", marginBottom: 16 }}>
                {[
                  { label: "Tickers", value: Object.keys(optResult.weights).join(", "), color: "var(--t1)" },
                  { label: "Return",  value: formatPercent(optResult.metrics.expected_annual_return), color: "var(--green)" },
                  { label: "Sharpe",  value: formatNumber(optResult.metrics.sharpe_ratio, 3), color: "var(--t1)" },
                ].map((r, i) => (
                  <div
                    key={r.label}
                    style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg-hover)", borderTop: i > 0 ? "1px solid var(--card-border)" : "none", fontSize: "0.75rem" }}
                  >
                    <span style={{ color: "var(--t3)" }}>{r.label}</span>
                    <span style={{ color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={savePortfolio}
              disabled={!saveNameInput.trim() || saving}
              style={{ width: "100%", padding: "10px 0", borderRadius: "var(--r-md)", fontSize: "0.8rem", fontWeight: 600, background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff", border: "none", cursor: !saveNameInput.trim() || saving ? "not-allowed" : "pointer", opacity: !saveNameInput.trim() || saving ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {saving ? <LoadingSpinner size="sm" /> : null}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function FieldInput({
  label, name, register, step = 1,
}: {
  label: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs" style={{ color: "var(--t3)" }}>{label}</label>
      <input
        {...register(name as never, { valueAsNumber: true })}
        type="number"
        step={step}
        className="w-full text-xs px-3 py-2 rounded border outline-none transition-colors"
        style={{ background: "var(--bg-hover)", borderColor: "var(--card-border)", color: "var(--t1)" }}
      />
    </div>
  );
}

// SVG donut chart — sector / geographic breakdown
function DonutChart({ title, data }: { title: string; data: Record<string, number> }) {
  if (!data) return null;
  const entries = Object.entries(data)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort(([, a], [, b]) => b - a);
  if (!entries.length) return null;
  const hasReal = entries.some(([k]) => k !== "Unknown");
  const filtered = hasReal ? entries.filter(([k]) => k !== "Unknown") : entries;
  const top = filtered.slice(0, 8);
  const total = top.reduce((s, [, v]) => s + v, 0);

  const R = 40;
  const CIRC = 2 * Math.PI * R;
  const GAP = 1.5;

  let cumFrac = 0;
  const segments = top.map(([name, val], i) => {
    const frac = val / total;
    const arcLen = Math.max(0, frac * CIRC - GAP);
    const startDeg = cumFrac * 360 - 90;
    cumFrac += frac;
    return { name, frac, arcLen, startDeg, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const top1 = segments[0];

  return (
    <div style={{ borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--card-border)" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t2)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>
        {/* Donut */}
        <div style={{ flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx={60} cy={60} r={R} fill="none" stroke="var(--bg-hover)" strokeWidth={16} />
            {segments.map((seg) => (
              <circle
                key={seg.name}
                cx={60} cy={60} r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={15}
                strokeLinecap="butt"
                strokeDasharray={`${seg.arcLen} ${CIRC}`}
                strokeDashoffset={0}
                transform={`rotate(${seg.startDeg} 60 60)`}
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            ))}
            {top1 && (
              <>
                <text x={60} y={56} textAnchor="middle" fontSize="10" fontWeight="700"
                  fill="var(--t1)">
                  {(top1.frac * 100).toFixed(0)}%
                </text>
                <text x={60} y={70} textAnchor="middle" fontSize="7"
                  fill="var(--t3)">
                  {top1.name.length > 12 ? top1.name.slice(0, 11) + "…" : top1.name}
                </text>
              </>
            )}
          </svg>
        </div>
        {/* Legend */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
          {segments.map((seg) => (
            <div key={seg.name} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: seg.color }} />
              <span style={{ flex: 1, fontSize: 11, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {seg.name}
              </span>
              <span style={{ fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>
                {(seg.frac * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Pure CSS vertical column chart — tickers on x-axis
function WeightBarChart({ weights }: { weights: Record<string, number> }) {
  const sorted = Object.entries(weights).sort(([, a], [, b]) => b - a);
  const maxW = sorted[0]?.[1] ?? 1;
  const CHART_H = 150;

  return (
    <div style={{ padding: "16px 20px 12px" }}>
      {/* Column area */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: CHART_H }}>
        {sorted.map(([ticker, w], i) => {
          const barH = Math.max(6, (w / maxW) * (CHART_H - 20));
          return (
            <div
              key={ticker}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
            >
              <span style={{ fontSize: 9, color: "var(--t3)", marginBottom: 3, userSelect: "none" }}>
                {(w * 100).toFixed(1)}%
              </span>
              <div style={{
                width: "clamp(8px, 70%, 52px)",
                height: barH,
                background: CHART_COLORS[i % CHART_COLORS.length],
                borderRadius: "3px 3px 0 0",
                transition: "height 0.5s ease",
              }} />
            </div>
          );
        })}
      </div>
      {/* Baseline */}
      <div style={{ height: 1, background: "var(--card-border)", marginBottom: 8 }} />
      {/* X-axis ticker labels */}
      <div style={{ display: "flex", gap: 6 }}>
        {sorted.map(([ticker]) => (
          <div
            key={ticker}
            style={{
              flex: 1, textAlign: "center",
              fontSize: 10,
              fontWeight: 600, color: "var(--orange)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {ticker}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildMcChartData(mc: MonteCarloResult) {
  const days = mc.days;
  const p = mc.percentiles;
  const line = { type: "scatter" as const, mode: "lines" as const };
  return [
    { ...line, x: days, y: p.p5,  name: "P5",     line: { color: "#D48585", width: 1, dash: "dot" as const } },
    { ...line, x: days, y: p.p25, name: "P25",    line: { color: "#C9B178", width: 1 } },
    { ...line, x: days, y: p.p50, name: "Median", line: { color: "#94A3B8", width: 2 } },
    { ...line, x: days, y: p.p75, name: "P75",    line: { color: "#C9B178", width: 1 } },
    { ...line, x: days, y: p.p95, name: "P95",    line: { color: "#86B38A", width: 1, dash: "dot" as const } },
    {
      ...line,
      x: [...days, ...days.slice().reverse()],
      y: [...p.p25, ...p.p75.slice().reverse()],
      fill: "toself" as const,
      fillcolor: "rgba(201,177,120,0.07)",
      line: { width: 0 },
      name: "IQR",
      showlegend: false,
      hoverinfo: "skip" as const,
    },
  ];
}

// --- 1-Click Portfolio Templates ---
interface PortfolioTemplate {
  id:          string;
  name:        string;
  description: string;
  theme:       string;
  tickers:     string[];
  method:      string;
  color:       string;
}

const PORTFOLIO_TEMPLATES: PortfolioTemplate[] = [
  {
    id:          "ai_titans",
    name:        "AI Titans",
    description: "Semiconductor & AI infrastructure — the picks-and-shovels of the AI revolution",
    theme:       "Technology · High Growth",
    tickers:     ["NVDA", "MSFT", "GOOGL", "AMZN", "AMD", "TSM", "AVGO", "META"],
    method:      "MeanVar",
    color:       "#7AA7E8",
  },
  {
    id:          "energy_transition",
    name:        "Energy Transition",
    description: "Renewables, EV infrastructure and grid — beneficiaries of the clean-energy shift",
    theme:       "Clean Energy · Thematic",
    tickers:     ["ENPH", "FSLR", "NEE", "TSLA", "RUN", "SEDG", "BEP", "CEG"],
    method:      "HRP",
    color:       "#86B38A",
  },
  {
    id:          "defensive_inflation",
    name:        "Defensive Anti-Inflation",
    description: "Real assets, dividend payers and commodities — stores of value in inflationary cycles",
    theme:       "Value · Defensive · Income",
    tickers:     ["XOM", "CVX", "GLD", "MCD", "KO", "PG", "WMT", "BRK-B"],
    method:      "MinVol",
    color:       "#C9B178",
  },
  {
    id:          "healthcare_innovation",
    name:        "Healthcare Innovation",
    description: "Biotech leaders, medical devices and pharma — secular growth driven by aging demographics",
    theme:       "Healthcare · Innovation",
    tickers:     ["JNJ", "PFE", "AMGN", "ABBV", "ISRG", "DXCM", "LLY", "TMO"],
    method:      "HRP",
    color:       "#D48585",
  },
];

function PortfolioTemplates({ onSelect }: { onSelect: (t: PortfolioTemplate) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: "var(--orange)", background: "none", border: "none", cursor: "pointer", opacity: 0.9 }}
      >
        <Sparkles size={11} />
        <span style={{ letterSpacing: "0.06em" }}>
          1-CLICK TEMPLATES
        </span>
        <span style={{ color: "var(--t3)", fontSize: 10 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
          {PORTFOLIO_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => { onSelect(tmpl); setOpen(false); }}
              className="portfolio-template-card text-left"
              style={{ padding: 16, borderRadius: "var(--r-xl)", border: "1px solid var(--card-border)", background: "var(--bg-card)", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: tmpl.color, flexShrink: 0 }} />
                <div style={{ fontWeight: 600, color: tmpl.color, fontSize: "0.82rem" }}>
                  {tmpl.name}
                </div>
                <span style={{ fontSize: "0.6rem", color: "var(--t3)", letterSpacing: "0.04em", marginLeft: "auto" }}>{tmpl.theme}</span>
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--t2)", lineHeight: 1.5, marginBottom: 10 }}>
                {tmpl.description}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {tmpl.tickers.slice(0, 5).map(tk => (
                  <span key={tk} style={{ padding: "2px 6px", borderRadius: "var(--r-md)", background: "var(--bg-hover)", color: "var(--t3)", fontSize: "0.6rem", border: "1px solid var(--card-border)" }}>
                    {tk}
                  </span>
                ))}
                {tmpl.tickers.length > 5 && (
                  <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>
                    +{tmpl.tickers.length - 5}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>{tmpl.method}</span>
                <span style={{ fontSize: "0.65rem", color: tmpl.color }}>Use →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
