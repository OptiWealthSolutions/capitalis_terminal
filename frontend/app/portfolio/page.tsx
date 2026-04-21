"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { usePlan } from "@/lib/plan";
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
  method: string;
  capital: number;
  result: OptimizationResult | null;
  savedAt: string;
}

const METHODS = [
  { value: "HRP",          label: "HRP",          desc: "Hierarchical Risk Parity" },
  { value: "MeanVar",      label: "Mean-Variance", desc: "Markowitz Efficient Frontier" },
  { value: "MinVol",       label: "Min Vol",       desc: "Minimum Volatility" },
  { value: "EqualWeights", label: "Equal",         desc: "Equal Weights" },
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
  const isDark = theme === "dark";

  const [activeTab, setActiveTab]             = useState<Tab>("optimize");
  const [tickers, setTickers]                 = useState<string[]>(["NVDA", "MSFT", "GOOG", "BRK-B"]);
  const [optResult, setOptResult]             = useState<OptimizationResult | null>(null);
  const [mcResult, setMcResult]               = useState<MonteCarloResult | null>(null);
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [saveModalOpen, setSaveModalOpen]     = useState(false);
  const [saveNameInput, setSaveNameInput]     = useState("");
  const [loadPanelOpen, setLoadPanelOpen]     = useState(false);
  const [compareSel, setCompareSel]           = useState<string[]>([]);
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
            method: r.method,
            capital: r.capital,
            result: null,       // results not persisted — user re-runs after loading
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
      });
    },
    onSuccess: (data) => {
      setOptResult(data);
      setMcResult(null);
      toast.success("Optimization complete — running Monte Carlo…");
      monteCarlo.mutate(data);
    },
    onError: () => toast.error("Optimization failed."),
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
      if (!pf?.result) throw new Error("Select a saved portfolio.");
      const pfTickers = Object.keys(pf.result.weights);
      const pfWeights = pfTickers.map((t) => pf.result!.weights[t]);
      return post<PerformanceResult>("/portfolio/performance", {
        tickers: pfTickers, weights: pfWeights, capital: pf.capital, start_date: perfStartDate,
      });
    },
    onSuccess: (data) => { setPerfResult(data); toast.success("Performance data loaded."); },
    onError: (e: Error) => toast.error(e.message || "Performance tracking failed."),
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
    // GBM implied vol: σ = ln(P95 / P5) / (2 × 1.645) for 1-year horizon
    const mc_vol     = Math.log(Math.max(p95_last, 1e-9) / Math.max(p5_last, 1e-9)) / (2 * 1.645);
    const mc_sharpe  = mc_vol > 0 ? (mc_return - 0.03) / mc_vol : 0;
    // Downside vol from VaR: σ_d ≈ VaR_95 / (capital × 1.645)
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
        className="fade-in p-4 sm:p-6"
        style={{ maxWidth: 1400, margin: "0 auto" }}
      >

        {/* ── Page header ── */}
        <div
          className="flex items-end justify-between pb-5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>
              {t.portfolio.breadcrumb}
            </p>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--t1)" }}>
              {t.portfolio.pageTitle}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLoadPanelOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors"
              style={{
                color: "var(--t2)",
                background: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <FolderOpen size={12} />
              {savedPortfolios.length > 0 ? `${savedPortfolios.length} saved` : "Load"}
            </button>
            <button
              onClick={() => { setSaveNameInput(""); setSaveModalOpen(true); }}
              disabled={!optResult}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all disabled:opacity-40"
              style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
            >
              <Save size={12} />
              Save
            </button>
          </div>
        </div>

        {/* ── Load panel ── */}
        {loadPanelOpen && (
          <div
            className="mt-4 rounded border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                Saved Portfolios
              </span>
              <button onClick={() => setLoadPanelOpen(false)} style={{ color: "var(--t3)" }}>
                <X size={13} />
              </button>
            </div>
            {savedPortfolios.length === 0 ? (
              <p className="px-5 py-4 text-xs" style={{ color: "var(--t3)" }}>No saved portfolios.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {savedPortfolios.map((pf) => (
                  <div key={pf.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--t1)" }}>{pf.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>
                        {pf.method} · {pf.tickers.join(", ")} · {pf.capital.toLocaleString()}€
                      </p>
                      {pf.result && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--t2)" }}>
                          Sharpe {formatNumber(pf.result.metrics.sharpe_ratio, 2)} ·{" "}
                          <span style={{ color: "var(--green)" }}>
                            {formatPercent(pf.result.metrics.expected_annual_return)}
                          </span>{" "}
                          · Vol {formatPercent(pf.result.metrics.annual_volatility)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => loadPortfolio(pf)}
                        className="text-xs font-medium"
                        style={{ color: "var(--orange)" }}
                      >
                        Load
                      </button>
                      <button onClick={() => deletePortfolio(pf.name)} style={{ color: "var(--t3)" }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Configuration panel ── */}
        <div
          className="mt-4 rounded border overflow-hidden"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={() => setConfigOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          >
            <span
              className="text-xs font-semibold tracking-widest uppercase flex items-center gap-2"
              style={{ color: "var(--t2)" }}
            >
              <BarChart2 size={13} style={{ color: "var(--orange)" }} />
              Configuration
            </span>
            {configOpen
              ? <ChevronUp size={13} style={{ color: "var(--t3)" }} />
              : <ChevronDown size={13} style={{ color: "var(--t3)" }} />
            }
          </button>

          {configOpen && (
            <div className="border-t" style={{ borderColor: "var(--border)" }}>
              <div className="grid grid-cols-1 md:grid-cols-12">

                {/* Left: Universe */}
                <div
                  className="col-span-1 md:col-span-5 px-4 sm:px-6 py-5 space-y-4"
                  style={{ borderRight: "1px solid var(--border)" }}
                >
                  <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t3)" }}>
                    Asset Universe
                  </p>

                  <div className="flex gap-2">
                    <input
                      {...register("tickerInput")}
                      placeholder="Add ticker (e.g. AAPL)"
                      className="flex-1 text-xs px-3 py-2 rounded border outline-none uppercase placeholder:normal-case placeholder:opacity-50 transition-colors"
                      style={{
                        background: "var(--bg-hover)",
                        borderColor: "var(--border)",
                        color: "var(--t1)",
                      }}
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
                      className="px-3 py-2 rounded text-xs font-medium transition-all"
                      style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useTopScored}
                      onChange={(e) => setUseTopScored(e.target.checked)}
                      className="w-3.5 h-3.5 rounded"
                    />
                    <span className="text-xs" style={{ color: "var(--t2)" }}>
                      Include Top 20% Scored Assets
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-1.5">
                    {tickers.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border"
                        style={{
                          background: "var(--bg-hover)",
                          borderColor: "var(--border)",
                          color: "var(--t1)",
                        }}
                      >
                        {t}
                        <button onClick={() => removeTicker(t)} style={{ color: "var(--t3)" }}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {useTopScored && (
                      <span
                        className="px-2 py-0.5 rounded text-xs border font-medium"
                        style={{
                          background: "var(--orange-dim)",
                          borderColor: "var(--orange-border)",
                          color: "var(--orange)",
                        }}
                      >
                        + TOP 20%
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Parameters */}
                <div className="col-span-1 md:col-span-7 px-4 sm:px-6 py-5">
                  <form id="opt-form" onSubmit={handleSubmit((d) => optimize.mutate(d))}>
                    <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: "var(--t3)" }}>
                      Optimization Method
                    </p>

                    {/* Method pill cards (disabled if locked by plan) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                      {METHODS.map((m) => {
                        const active = watchedMethod === m.value;
                        const locked = !canUseMethod(m.value);
                        return (
                          <button
                            key={m.value}
                            type="button"
                            disabled={locked}
                            title={locked ? `Locked — upgrade to unlock ${m.label}` : ""}
                            onClick={() => !locked && setValue("method", m.value)}
                            className="text-left px-3 py-2.5 rounded border transition-all relative"
                            style={{
                              background: locked
                                ? "var(--bg-hover)"
                                : active ? "var(--orange-dim)" : "var(--bg-hover)",
                              borderColor: active && !locked ? "var(--orange-border)" : "var(--border)",
                              opacity: locked ? 0.45 : 1,
                              cursor: locked ? "not-allowed" : "pointer",
                            }}
                          >
                            {locked && (
                              <Lock
                                size={10}
                                style={{ position: "absolute", top: 6, right: 6, color: "var(--t3)" }}
                              />
                            )}
                            <p
                              className="text-xs font-semibold"
                              style={{ color: active && !locked ? "var(--orange)" : "var(--t1)" }}
                            >
                              {m.label}
                            </p>
                            <p
                              className="text-xs mt-0.5 leading-snug"
                              style={{
                                color: active && !locked ? "var(--orange)" : "var(--t3)",
                                opacity: active && !locked ? 0.8 : 1,
                              }}
                            >
                              {m.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {plan === "free" && (
                      <p className="text-xs mb-4" style={{ color: "var(--t3)" }}>
                        Free plan — only Equal Weights is available.{" "}
                        <Link href="/account" style={{ color: "var(--orange)" }}>Upgrade →</Link>
                      </p>
                    )}
                    {plan === "pro" && (
                      <p className="text-xs mb-4" style={{ color: "var(--t3)" }}>
                        HRP locked — included in Institutional plan.{" "}
                        <Link href="/account" style={{ color: "var(--orange)" }}>Upgrade →</Link>
                      </p>
                    )}

                    <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--t3)" }}>
                      Parameters
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                      <FieldInput label="Capital (€)" name="capital" register={register} />
                      <FieldInput label="Min weight" name="min_weight" register={register} step={0.01} />
                      <FieldInput label="Max weight" name="max_weight" register={register} step={0.01} />
                      <FieldInput label="Risk aversion" name="risk_aversion" register={register} step={0.1} />
                      <div className="space-y-1">
                        <label className="text-xs" style={{ color: "var(--t3)" }}>Max assets</label>
                        <input
                          type="number" min={2} max={50} step={1} placeholder="All"
                          {...register("max_assets", {
                            setValueAs: (v) => (v === "" || v === null) ? null : Number(v),
                          })}
                          className="w-full text-xs px-3 py-2 rounded border outline-none transition-colors placeholder:opacity-40"
                          style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end mt-4">
                      <button
                        type="submit"
                        disabled={optimize.isPending || (tickers.length === 0 && !useTopScored)}
                        className="flex items-center gap-2 px-5 py-2 rounded text-xs font-semibold tracking-wider transition-all disabled:opacity-50"
                        style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
                      >
                        {optimize.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
                        {optimize.isPending ? "Optimizing…" : "Run Optimization"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-0 mt-6 border-b" style={{ borderColor: "var(--border)" }}>
          {(["optimize", "montecarlo", "compare", "performance"] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className="pb-3 px-1 mr-7 text-xs tracking-widest uppercase border-b-2 -mb-px transition-colors"
              style={{
                borderColor: activeTab === tabKey ? "var(--orange)" : "transparent",
                color: activeTab === tabKey ? "var(--orange)" : "var(--t3)",
                fontWeight: activeTab === tabKey ? 600 : 400,
              }}
            >
              {t.portfolio.tabs[tabKey]}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════
            OPTIMIZE TAB
        ════════════════════════════════════════════════ */}
        {activeTab === "optimize" && (
          <div className="pt-5 space-y-5">
            {optimize.isPending && (
              <div className="flex items-center justify-center h-52">
                <LoadingSpinner label="Optimizing portfolio…" size="lg" />
              </div>
            )}

            {optResult && !optimize.isPending && (
              <>
                {/* ── Key metrics — 2 rows ── */}
                {(monteCarlo.isPending) && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded border text-xs"
                    style={{ borderColor: "var(--orange-border)", background: "var(--orange-dim)", color: "var(--orange)" }}>
                    <LoadingSpinner size="sm" />
                    Running 1 000 Monte Carlo simulations…
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0 rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  {[
                    {
                      label: mcMetrics ? "Expected Return (MC)" : "Expected Return",
                      value: formatPercent(mcMetrics ? mcMetrics.mc_return : optResult.metrics.expected_annual_return),
                      color: "var(--green)",
                    },
                    {
                      label: mcMetrics ? "Annualized Vol. (MC)" : "Annualized Vol.",
                      value: formatPercent(mcMetrics ? mcMetrics.mc_vol : optResult.metrics.annual_volatility),
                      color: "var(--yellow)",
                    },
                    {
                      label: mcMetrics ? "Sharpe (MC)" : "Sharpe Ratio",
                      value: formatNumber(mcMetrics ? mcMetrics.mc_sharpe : optResult.metrics.sharpe_ratio, 3),
                      color: "var(--orange)",
                    },
                    {
                      label: mcMetrics ? "Worst Case P5 (MC)" : "Max Drawdown",
                      value: mcMetrics
                        ? formatPercent(mcMetrics.mc_worst)
                        : formatPercent(optResult.metrics.max_drawdown),
                      color: "var(--red)",
                    },
                  ].map((m, i) => (
                    <div
                      key={m.label}
                      className="px-5 py-4"
                      style={{
                        background: "var(--bg-card)",
                        borderRight: i < 3 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <p className="text-xs mb-1.5 flex items-center gap-1" style={{ color: "var(--t3)" }}>
                        {m.label}
                        {mcMetrics && (
                          <span className="px-1 rounded text-xs"
                            style={{ background: "var(--orange-dim)", color: "var(--orange)", fontSize: 9 }}>
                            GBM
                          </span>
                        )}
                      </p>
                      <p className="text-base font-semibold font-mono" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  {[
                    {
                      label: mcMetrics ? "Sortino (MC)" : "Sortino Ratio",
                      value: formatNumber(mcMetrics ? mcMetrics.mc_sortino : optResult.metrics.sortino_ratio, 3),
                      color: "var(--orange)",
                    },
                    {
                      label: "Calmar Ratio",
                      value: formatNumber(optResult.metrics.calmar_ratio, 3),
                      color: "var(--orange)",
                    },
                    {
                      label: "Beta vs S&P",
                      value: formatNumber(optResult.metrics.beta, 3),
                      color: "var(--t2)",
                    },
                  ].map((m, i) => (
                    <div
                      key={m.label}
                      className="px-5 py-4"
                      style={{
                        background: "var(--bg-card)",
                        borderRight: i < 2 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <p className="text-xs mb-1.5 flex items-center gap-1" style={{ color: "var(--t3)" }}>
                        {m.label}
                        {mcMetrics && i < 1 && (
                          <span className="px-1 rounded text-xs"
                            style={{ background: "var(--orange-dim)", color: "var(--orange)", fontSize: 9 }}>
                            GBM
                          </span>
                        )}
                      </p>
                      <p className="text-base font-semibold font-mono" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Diversification breakdowns (top) ── */}
                {optResult.diversification && (
                  <div className="grid grid-cols-2 gap-4">
                    <DonutChart
                      title="Sector Breakdown"
                      data={optResult.diversification.sectors}
                    />
                    <DonutChart
                      title="Geographic Breakdown"
                      data={optResult.diversification.countries}
                    />
                  </div>
                )}

                {/* ── Weight distribution — horizontal CSS bars ── */}
                <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                      Weight Distribution
                    </span>
                  </div>
                  <WeightBarChart weights={optResult.weights} />
                </div>

                {/* ── Allocation table ── */}
                <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <div
                    className="px-5 py-3 border-b flex items-center gap-2"
                    style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                  >
                    <Target size={13} style={{ color: "var(--orange)" }} />
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                      Capital Allocation — {optResult.method}
                    </span>
                  </div>
                  {(() => {
                    const allRows = Object.entries(optResult.weights).sort(([, a], [, b]) => b - a);
                    const rows = allocShowAll ? allRows : allRows.slice(0, TABLE_PAGE);
                    return (
                      <>
                        <table className="w-full text-xs" style={{ background: "var(--bg-card)" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                              {["Ticker", "Weight", "Allocation (EUR)", "Distribution"].map((h) => (
                                <th key={h} className="px-5 py-2.5 text-left font-semibold tracking-widest"
                                  style={{ color: "var(--t3)", fontSize: 10 }}>
                                  {h.toUpperCase()}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(([t, w], i) => (
                              <tr key={t} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td className="px-5 py-3 font-semibold font-mono" style={{ color: "var(--orange)" }}>{t}</td>
                                <td className="px-5 py-3 font-mono" style={{ color: "var(--t1)" }}>{formatPercent(w)}</td>
                                <td className="px-5 py-3 font-mono" style={{ color: "var(--t2)" }}>{formatCurrency(optResult.allocation_eur[t])}</td>
                                <td className="px-5 py-3 w-48">
                                  <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--bg-hover)" }}>
                                    <div className="h-full rounded-full"
                                      style={{ width: `${w * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {allRows.length > TABLE_PAGE && (
                          <button
                            onClick={() => setAllocShowAll((v) => !v)}
                            className="w-full py-2.5 text-xs transition-colors border-t"
                            style={{ color: "var(--t3)", borderColor: "var(--border)", background: "var(--bg-card)" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--orange)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t3)")}
                          >
                            {allocShowAll
                              ? `Show top ${TABLE_PAGE}`
                              : `Show all ${allRows.length} assets`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {/* ── DCA Calculator ── */}
            {optResult && !optimize.isPending && (() => {
              const freqLabel: Record<string, string> = {
                daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly",
              };
              const rows = Object.entries(optResult.weights)
                .sort(([, a], [, b]) => b - a)
                .map(([ticker, w]) => {
                  const perPeriod = dcaAmount * w;
                  const total     = perPeriod * dcaIter;
                  return { ticker, w, perPeriod, total };
                });
              const grandTotal = dcaAmount * dcaIter;
              return (
                <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <div
                    className="px-5 py-3 border-b flex items-center justify-between"
                    style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                  >
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                      DCA Calculator
                    </span>
                    <div className="flex items-center gap-3">
                      {/* Amount per period */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: "var(--t3)" }}>Amount / period</span>
                        <input
                          type="number" min={1} step={50} value={dcaAmount}
                          onChange={(e) => setDcaAmount(Math.max(1, Number(e.target.value)))}
                          className="text-xs px-2 py-1 rounded border outline-none w-20 font-mono"
                          style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                        />
                        <span className="text-xs" style={{ color: "var(--t3)" }}>€</span>
                      </div>
                      {/* Frequency pills */}
                      <div className="flex items-center gap-1">
                        {(["daily", "weekly", "monthly", "quarterly"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setDcaFreq(f)}
                            className="px-2.5 py-1 rounded text-xs border transition-all"
                            style={{
                              background: dcaFreq === f ? "var(--orange-dim)" : "var(--bg-hover)",
                              borderColor: dcaFreq === f ? "var(--orange-border)" : "var(--border)",
                              color: dcaFreq === f ? "var(--orange)" : "var(--t3)",
                            }}
                          >
                            {freqLabel[f]}
                          </button>
                        ))}
                      </div>
                      {/* Iterations */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: "var(--t3)" }}>Periods</span>
                        <input
                          type="number" min={1} max={1000} step={1} value={dcaIter}
                          onChange={(e) => setDcaIter(Math.max(1, Number(e.target.value)))}
                          className="text-xs px-2 py-1 rounded border outline-none w-16 font-mono"
                          style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                        />
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const visRows = dcaShowAll ? rows : rows.slice(0, TABLE_PAGE);
                    return (
                      <>
                        <table className="w-full text-xs" style={{ background: "var(--bg-card)" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                              {["Ticker", "Weight", `Per ${freqLabel[dcaFreq]} (€)`, `After ${dcaIter}× (€)`, "Distribution"].map((h) => (
                                <th key={h} className="px-5 py-2.5 text-left font-semibold tracking-widest"
                                  style={{ color: "var(--t3)", fontSize: 10 }}>
                                  {h.toUpperCase()}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visRows.map(({ ticker, w, perPeriod, total }, i) => (
                              <tr key={ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td className="px-5 py-3 font-semibold font-mono" style={{ color: "var(--orange)" }}>{ticker}</td>
                                <td className="px-5 py-3 font-mono" style={{ color: "var(--t1)" }}>{formatPercent(w)}</td>
                                <td className="px-5 py-3 font-mono" style={{ color: "var(--t2)" }}>{formatCurrency(perPeriod)}</td>
                                <td className="px-5 py-3 font-mono" style={{ color: "var(--green)" }}>{formatCurrency(total)}</td>
                                <td className="px-5 py-3 w-40">
                                  <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--bg-hover)" }}>
                                    <div className="h-full rounded-full"
                                      style={{ width: `${w * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: "2px solid var(--border)" }}>
                              <td className="px-5 py-3 font-semibold text-xs" colSpan={2} style={{ color: "var(--t3)" }}>
                                TOTAL ({dcaIter} {freqLabel[dcaFreq].toLowerCase()} periods)
                              </td>
                              <td className="px-5 py-3 font-mono font-semibold" style={{ color: "var(--t1)" }}>{formatCurrency(dcaAmount)}</td>
                              <td className="px-5 py-3 font-mono font-semibold" style={{ color: "var(--green)" }}>{formatCurrency(grandTotal)}</td>
                              <td />
                            </tr>
                          </tbody>
                        </table>
                        {rows.length > TABLE_PAGE && (
                          <button
                            onClick={() => setDcaShowAll((v) => !v)}
                            className="w-full py-2.5 text-xs transition-colors border-t"
                            style={{ color: "var(--t3)", borderColor: "var(--border)", background: "var(--bg-card)" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--orange)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t3)")}
                          >
                            {dcaShowAll ? `Show top ${TABLE_PAGE}` : `Show all ${rows.length} assets`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })()}

            {!optResult && !optimize.isPending && (
              <div
                className="flex flex-col items-center justify-center h-52 rounded border text-center space-y-2"
                style={{ borderColor: "var(--border)", borderStyle: "dashed", background: "var(--bg-card)" }}
              >
                <TrendingUp size={22} style={{ color: "var(--t3)" }} />
                <p className="text-xs" style={{ color: "var(--t3)" }}>
                  Configure parameters above and run optimization.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            RISK SIM TAB
        ════════════════════════════════════════════════ */}
        {activeTab === "montecarlo" && (
          <div className="pt-5 space-y-4">
            {!optResult ? (
              <div
                className="flex items-center justify-center h-40 rounded border text-center"
                style={{ borderColor: "var(--border)", borderStyle: "dashed", background: "var(--bg-card)" }}
              >
                <p className="text-xs" style={{ color: "var(--t3)" }}>
                  Run portfolio optimization first.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: "var(--t2)" }}>
                    {optResult.method} · {Object.keys(optResult.weights).length} assets · 1 000 simulations · 252 trading days
                  </p>
                  <button
                    onClick={() => monteCarlo.mutate(undefined)}
                    disabled={monteCarlo.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-all disabled:opacity-50"
                    style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
                  >
                    {monteCarlo.isPending ? <LoadingSpinner size="sm" /> : <Activity size={12} />}
                    {monteCarlo.isPending ? "Simulating…" : "Run Monte Carlo"}
                  </button>
                </div>

                {monteCarlo.isPending && <SkeletonChart height={400} />}

                {mcResult && !monteCarlo.isPending && (
                  <>
                    <div
                      className="grid grid-cols-2 md:grid-cols-4 gap-0 rounded border overflow-hidden"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {[
                        { label: "Expected Final Value", value: formatCurrency(mcResult.risk_metrics.expected_final_value), color: "var(--green)" },
                        { label: "VaR 95% (1Y)",         value: `-${formatCurrency(mcResult.risk_metrics.var_95)}`,         color: "var(--red)" },
                        { label: "CVaR 95% (1Y)",        value: `-${formatCurrency(mcResult.risk_metrics.cvar_95)}`,        color: "var(--red)" },
                        { label: "Worst Case P5",        value: formatCurrency(mcResult.risk_metrics.worst_case_p5),        color: "var(--yellow)" },
                      ].map((m, i) => (
                        <div
                          key={m.label}
                          className="px-5 py-4"
                          style={{
                            background: "var(--bg-card)",
                            borderRight: i < 3 ? "1px solid var(--border)" : "none",
                          }}
                        >
                          <p className="text-xs mb-1.5" style={{ color: "var(--t3)" }}>{m.label}</p>
                          <p className="text-base font-semibold font-mono" style={{ color: m.color }}>{m.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                          Simulation Fan Chart
                        </span>
                      </div>
                      <PlotlyChart card={false}
                        data={mcData}
                        layout={{
                          yaxis: { title: { text: "Portfolio Value (EUR)", font: { size: 10, color: axisCol } }, gridcolor: gridCol, color: axisCol },
                          xaxis: { title: { text: "Trading Days", font: { size: 10, color: axisCol } }, gridcolor: gridCol, color: axisCol },
                          paper_bgcolor: paperBg,
                          plot_bgcolor: paperBg,
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
          <div className="pt-5 space-y-4">
            {savedPortfolios.length < 2 ? (
              <div
                className="flex items-center justify-center h-40 rounded border text-center"
                style={{ borderColor: "var(--border)", borderStyle: "dashed", background: "var(--bg-card)" }}
              >
                <p className="text-xs" style={{ color: "var(--t3)" }}>
                  Save at least 2 optimized portfolios to compare.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                      Select Portfolios
                    </span>
                  </div>
                  <div className="px-5 py-4 flex flex-wrap gap-2">
                    {savedPortfolios.map((pf) => (
                      <button
                        key={pf.id}
                        onClick={() =>
                          setCompareSel((prev) =>
                            prev.includes(pf.id) ? prev.filter((id) => id !== pf.id) : [...prev, pf.id]
                          )
                        }
                        className="px-3 py-1.5 text-xs rounded border transition-all"
                        style={{
                          background: compareSel.includes(pf.id) ? "var(--orange-dim)" : "var(--bg-hover)",
                          borderColor: compareSel.includes(pf.id) ? "var(--orange-border)" : "var(--border)",
                          color: compareSel.includes(pf.id) ? "var(--orange)" : "var(--t2)",
                        }}
                      >
                        {pf.name}
                      </button>
                    ))}
                  </div>
                </div>

                {comparePortfolios.length >= 2 && (
                  <>
                    <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                      <div
                        className="px-5 py-3 border-b"
                        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                      >
                        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                          Performance Comparison
                        </span>
                      </div>
                      <table className="w-full text-xs" style={{ background: "var(--bg-card)" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            {["Portfolio", "Method", "Return", "Vol", "Sharpe", "Sortino", "Calmar", "Max DD", "Beta"].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 text-left font-semibold tracking-widest"
                                style={{ color: "var(--t3)", fontSize: 10 }}
                              >
                                {h.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparePortfolios.map((pf, i) => (
                            <tr key={pf.id} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td className="px-4 py-3 font-medium" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{pf.name}</td>
                              <td className="px-4 py-3" style={{ color: "var(--t2)" }}>{pf.method}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--green)" }}>{formatPercent(pf.result!.metrics.expected_annual_return)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--yellow)" }}>{formatPercent(pf.result!.metrics.annual_volatility)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.sharpe_ratio, 3)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.sortino_ratio, 3)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.calmar_ratio, 3)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--red)" }}>{formatPercent(pf.result!.metrics.max_drawdown)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "var(--t1)" }}>{formatNumber(pf.result!.metrics.beta, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
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
          <div className="pt-5 space-y-4">
            <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                  Track Portfolio Performance
                </span>
              </div>
              <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="col-span-1 md:col-span-5 space-y-1">
                  <label className="text-xs" style={{ color: "var(--t3)" }}>Saved Portfolio</label>
                  {savedPortfolios.length === 0 ? (
                    <p className="text-xs py-2" style={{ color: "var(--t3)" }}>No saved portfolios.</p>
                  ) : (
                    <select
                      value={perfPortfolioId}
                      onChange={(e) => { setPerfPortfolioId(e.target.value); setPerfResult(null); }}
                      className="w-full text-xs px-3 py-2 rounded border outline-none transition-colors"
                      style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                    >
                      <option value="">— select —</option>
                      {savedPortfolios.map((pf) => (
                        <option key={pf.id} value={pf.id}>{pf.name} ({pf.method})</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="col-span-3 space-y-1">
                  <label className="text-xs" style={{ color: "var(--t3)" }}>Start date</label>
                  <input
                    type="date"
                    value={perfStartDate}
                    onChange={(e) => { setPerfStartDate(e.target.value); setPerfResult(null); }}
                    className="w-full text-xs px-3 py-2 rounded border outline-none transition-colors"
                    style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                  />
                </div>
                <div className="col-span-4 flex justify-end">
                  <button
                    onClick={() => performance.mutate()}
                    disabled={performance.isPending || !perfPortfolioId}
                    className="flex items-center gap-2 px-5 py-2 rounded text-xs font-semibold transition-all disabled:opacity-50"
                    style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
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
                <div
                  className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded border overflow-hidden"
                  style={{ borderColor: "var(--border)" }}
                >
                  {[
                    { label: "Total Return",  value: formatPercent(perfResult.metrics.total_return),   color: perfResult.metrics.total_return >= 0 ? "var(--green)" : "var(--red)" },
                    { label: "Current Value", value: formatCurrency(perfResult.metrics.current_value), color: "var(--orange)" },
                    { label: "Max Drawdown",  value: formatPercent(perfResult.metrics.max_drawdown),   color: "var(--red)" },
                  ].map((m, i) => (
                    <div
                      key={m.label}
                      className="px-5 py-4"
                      style={{ background: "var(--bg-card)", borderRight: i < 2 ? "1px solid var(--border)" : "none" }}
                    >
                      <p className="text-xs mb-1.5" style={{ color: "var(--t3)" }}>{m.label}</p>
                      <p className="text-base font-semibold font-mono" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {perfResult.metrics.ann_return !== undefined && (
                  <div
                    className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded border overflow-hidden"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {[
                      { label: "Ann. Return",     value: formatPercent(perfResult.metrics.ann_return!),     color: perfResult.metrics.ann_return! >= 0 ? "var(--green)" : "var(--red)" },
                      { label: "Ann. Volatility", value: formatPercent(perfResult.metrics.ann_volatility!), color: "var(--yellow)" },
                      { label: "Beta (vs SPY)",   value: perfResult.metrics.beta !== undefined ? formatNumber(perfResult.metrics.beta, 3) : "—", color: "var(--t1)" },
                    ].map((m, i) => (
                      <div
                        key={m.label}
                        className="px-5 py-4"
                        style={{ background: "var(--bg-card)", borderRight: i < 2 ? "1px solid var(--border)" : "none" }}
                      >
                        <p className="text-xs mb-1.5" style={{ color: "var(--t3)" }}>{m.label}</p>
                        <p className="text-base font-semibold font-mono" style={{ color: m.color }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {perfResult.metrics.sharpe_ratio !== undefined && (
                  <div
                    className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded border overflow-hidden"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {[
                      { label: "Sharpe Ratio",  value: formatNumber(perfResult.metrics.sharpe_ratio!, 4) },
                      { label: "Sortino Ratio", value: formatNumber(perfResult.metrics.sortino_ratio!, 4) },
                      { label: "Calmar Ratio",  value: formatNumber(perfResult.metrics.calmar_ratio!, 4) },
                    ].map((m, i) => (
                      <div
                        key={m.label}
                        className="px-5 py-4"
                        style={{ background: "var(--bg-card)", borderRight: i < 2 ? "1px solid var(--border)" : "none" }}
                      >
                        <p className="text-xs mb-1.5" style={{ color: "var(--t3)" }}>{m.label}</p>
                        <p className="text-base font-semibold font-mono" style={{ color: "var(--orange)" }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
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
                      xaxis: { gridcolor: gridCol, color: axisCol },
                      paper_bgcolor: paperBg,
                      plot_bgcolor: paperBg,
                      legend: { orientation: "h", y: -0.2, font: { size: 10, color: axisCol } },
                    }}
                    height={380}
                  />
                </div>

                {(() => {
                  const pf = savedPortfolios.find((p) => p.id === perfPortfolioId);
                  return pf?.result ? (
                    <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
                          Composition at t = {perfStartDate}
                        </span>
                      </div>
                      <div className="px-5 py-4 flex flex-wrap gap-2">
                        {Object.entries(pf.result.weights)
                          .sort(([, a], [, b]) => b - a)
                          .map(([tk, w]) => (
                            <span
                              key={tk}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs"
                              style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}
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
                className="flex items-center justify-center h-40 rounded border text-center"
                style={{ borderColor: "var(--border)", borderStyle: "dashed", background: "var(--bg-card)" }}
              >
                <p className="text-xs" style={{ color: "var(--t3)" }}>
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
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="w-80 rounded-lg border p-6 space-y-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-wider" style={{ color: "var(--t1)" }}>Save Portfolio</span>
              <button onClick={() => setSaveModalOpen(false)} style={{ color: "var(--t3)" }}>
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs" style={{ color: "var(--t3)" }}>Portfolio name</label>
              <input
                autoFocus
                value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePortfolio()}
                placeholder="e.g. Tech Growth Q2"
                className="w-full text-xs px-3 py-2 rounded border outline-none transition-colors"
                style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
              />
            </div>

            {optResult && (
              <div className="rounded border divide-y text-xs" style={{ borderColor: "var(--border)" }}>
                {[
                  { label: "Tickers", value: Object.keys(optResult.weights).join(", "), color: "var(--t1)" },
                  { label: "Return",  value: formatPercent(optResult.metrics.expected_annual_return), color: "var(--green)" },
                  { label: "Sharpe",  value: formatNumber(optResult.metrics.sharpe_ratio, 3), color: "var(--t1)" },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="flex justify-between px-3 py-2"
                    style={{ background: "var(--bg-hover)" }}
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
              className="w-full py-2.5 rounded text-xs font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "var(--orange)", color: isDark ? "#0A0A0A" : "#ffffff" }}
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
        style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
      />
    </div>
  );
}

// SVG donut chart — sector / geographic breakdown
function DonutChart({ title, data }: { title: string; data: Record<string, number> }) {
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
    <div className="rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>{title}</span>
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
                  fontFamily="JetBrains Mono, monospace" fill="var(--t1)">
                  {(top1.frac * 100).toFixed(0)}%
                </text>
                <text x={60} y={70} textAnchor="middle" fontSize="7"
                  fontFamily="JetBrains Mono, monospace" fill="var(--t3)">
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
              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--t3)", flexShrink: 0 }}>
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
              <span style={{
                fontSize: 9, fontFamily: "JetBrains Mono, monospace",
                color: "var(--t3)", marginBottom: 3, userSelect: "none",
              }}>
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
      <div style={{ height: 1, background: "var(--border)", marginBottom: 8 }} />
      {/* X-axis ticker labels */}
      <div style={{ display: "flex", gap: 6 }}>
        {sorted.map(([ticker]) => (
          <div
            key={ticker}
            style={{
              flex: 1, textAlign: "center",
              fontSize: 10, fontFamily: "JetBrains Mono, monospace",
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
