"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { post } from "@/lib/api";
import type { OptimizationResult, MonteCarloResult, PerformanceResult } from "@/lib/types";
import MetricCard from "@/components/ui/MetricCard";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { LoadingSpinner, SkeletonChart } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatPercent, formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Play, BarChart2, Save, FolderOpen, X, GitCompare, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Tab = "optimize" | "montecarlo" | "compare" | "performance";

const OptSchema = z.object({
  tickerInput: z.string(),
  method: z.string(), // Assoupli pour ne pas casser les anciens portefeuilles sauvegardés
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

const STORAGE_KEY = "capitalis_portfolios_v2";

const METHODS = [
  { value: "HRP",          label: "HRP (Hierarchical Risk Parity)" },
  { value: "MeanVar",      label: "Markowitz (Mean-Variance)" },
  { value: "MinVol",       label: "Minimum Volatility" },
  { value: "EqualWeights", label: "Equal Weights" },
];

const PIE_COLORS = [
  "#F97316", "#22C55E", "#60A5FA", "#EF4444", "#A855F7",
  "#14B8A6", "#EAB308", "#F43F5E", "#34D399", "#FBBF24",
];

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------
function loadPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistPortfolios(portfolios: SavedPortfolio[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PortfolioPage() {
  const [activeTab, setActiveTab]     = useState<Tab>("optimize");
  const [tickers, setTickers]         = useState<string[]>(["NVDA", "MSFT", "GOOG", "BRK-B"]);
  const [optResult, setOptResult]     = useState<OptimizationResult | null>(null);
  const [mcResult, setMcResult]       = useState<MonteCarloResult | null>(null);
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [saveModalOpen, setSaveModalOpen]     = useState(false);
  const [saveNameInput, setSaveNameInput]     = useState("");
  const [loadPanelOpen, setLoadPanelOpen]     = useState(false);
  const [compareSel, setCompareSel]           = useState<string[]>([]);
  const [paramsOpen, setParamsOpen]           = useState(true);
  const [useTopScored, setUseTopScored]       = useState(true);
  const [perfPortfolioId, setPerfPortfolioId] = useState<string>("");
  const [perfStartDate, setPerfStartDate]     = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  });
  const [perfResult, setPerfResult]           = useState<PerformanceResult | null>(null);

  // Load saved portfolios on mount
  useEffect(() => {
    setSavedPortfolios(loadPortfolios());
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

  // --------------------------------------------------------------------------
  // Optimize mutation
  // --------------------------------------------------------------------------
  const optimize = useMutation({
    mutationFn: (data: OptForm) =>
      {
        let payloadTickers = useTopScored && !tickers.includes("TOP20") 
          ? [...tickers, "TOP20"] 
          : tickers;

        // Contournement de la validation Pydantic (min_items=2) si TOP20 est seul
        if (payloadTickers.length === 1 && payloadTickers[0] === "TOP20") {
          payloadTickers = ["TOP20", "TOP20"];
        }

        return post<OptimizationResult>("/portfolio/optimize", {
        tickers: payloadTickers,
        method: data.method,
        capital: data.capital,
        min_weight: data.min_weight,
        max_weight: data.max_weight,
        risk_aversion: data.risk_aversion,
        max_assets: data.max_assets ?? undefined,
      })},
    onSuccess: (data) => {
      setOptResult(data);
      toast.success("Optimization complete.");
    },
    onError: () => toast.error("Optimization failed."),
  });

  // --------------------------------------------------------------------------
  // Monte Carlo mutation
  // --------------------------------------------------------------------------
  const monteCarlo = useMutation({
    mutationFn: () => {
      if (!optResult) throw new Error("Run optimization first.");
      // Merge tickers state (user-defined, minus TOP20 placeholder) with all
      // tickers that received weights from optimization (includes TOP20 expansion).
      const userTickers = tickers.filter((t) => t !== "TOP20");
      const optTickers  = Object.keys(optResult.weights);
      const allTickers  = [...new Set([...optTickers, ...userTickers])];
      const rawWeights  = allTickers.map((t) => optResult.weights[t] ?? 0);
      const totalW      = rawWeights.reduce((a, b) => a + b, 0);
      const weights     = totalW > 0
        ? rawWeights.map((w) => w / totalW)
        : allTickers.map(() => 1 / allTickers.length);
      return post<MonteCarloResult>("/portfolio/monte-carlo", {
        tickers: allTickers,
        weights,
        capital: optResult.allocation_eur
          ? Object.values(optResult.allocation_eur).reduce((a, b) => a + b, 0)
          : 20000,
        n_simulations: 1000,
        horizon_days: 252,
      });
    },
    onSuccess: (data) => {
      setMcResult(data);
      toast.success("Monte Carlo simulation complete.");
    },
    onError: () => toast.error("Monte Carlo failed."),
  });

  // --------------------------------------------------------------------------
  // Performance tracking mutation
  // --------------------------------------------------------------------------
  const performance = useMutation({
    mutationFn: () => {
      const pf = savedPortfolios.find((p) => p.id === perfPortfolioId);
      if (!pf?.result) throw new Error("Select a saved portfolio with optimization results.");
      const pfTickers = Object.keys(pf.result.weights);
      const pfWeights = pfTickers.map((t) => pf.result!.weights[t]);
      return post<PerformanceResult>("/portfolio/performance", {
        tickers: pfTickers,
        weights: pfWeights,
        capital: pf.capital,
        start_date: perfStartDate,
      });
    },
    onSuccess: (data) => {
      setPerfResult(data);
      toast.success("Performance data loaded.");
    },
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
  // Save portfolio
  // --------------------------------------------------------------------------
  const savePortfolio = () => {
    const name = saveNameInput.trim();
    if (!name) { toast.error("Enter a portfolio name."); return; }
    if (!optResult) { toast.error("Run optimization before saving."); return; }

    const formValues = getValues();
    const pf: SavedPortfolio = {
      id: crypto.randomUUID(),
      name,
      tickers: [...tickers],
      method: formValues.method,
      capital: formValues.capital,
      result: optResult,
      savedAt: new Date().toISOString(),
    };

    const updated = [pf, ...savedPortfolios.filter((p) => p.name !== name)];
    setSavedPortfolios(updated);
    persistPortfolios(updated);
    setSaveModalOpen(false);
    setSaveNameInput("");
    toast.success(`Portfolio "${name}" saved.`);
  };

  // --------------------------------------------------------------------------
  // Load portfolio
  // --------------------------------------------------------------------------
  const loadPortfolio = (pf: SavedPortfolio) => {
    setTickers(pf.tickers);
    setValue("method", pf.method as OptForm["method"]);
    setValue("capital", pf.capital);
    setOptResult(pf.result);
    setLoadPanelOpen(false);
    toast.success(`Loaded "${pf.name}"`);
  };

  const deletePortfolio = (id: string) => {
    const updated = savedPortfolios.filter((p) => p.id !== id);
    setSavedPortfolios(updated);
    persistPortfolios(updated);
    toast.success("Portfolio deleted.");
  };

  // --------------------------------------------------------------------------
  // Chart data
  // --------------------------------------------------------------------------
  const pieData = optResult
    ? [{
        type: "pie" as const,
        labels: Object.keys(optResult.weights),
        values: Object.values(optResult.weights),
        marker: { colors: PIE_COLORS },
        textfont: { size: 10 },
        hole: 0.45,
        hovertemplate: "%{label}: %{percent}<extra></extra>",
      }]
    : [];

  const mcData = mcResult ? buildMcChartData(mcResult) : [];

  // Compare chart
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
    marker: { color: PIE_COLORS[i % PIE_COLORS.length] },
  }));

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
            Portfolio Optimization
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLoadPanelOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-secondary border border-bg-border rounded-md text-text-secondary hover:text-text-primary hover:border-accent-blue transition-all"
            >
              <FolderOpen size={12} />
              {savedPortfolios.length > 0 ? `${savedPortfolios.length} SAVED` : "LOAD"}
            </button>
            <button
              onClick={() => { setSaveNameInput(""); setSaveModalOpen(true); }}
              disabled={!optResult}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-blue rounded-md text-black font-medium hover:bg-orange-600 disabled:opacity-40 transition-all"
            >
              <Save size={12} />
              SAVE
            </button>
          </div>
        </div>

        {/* Load panel */}
        {loadPanelOpen && (
          <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <Label>SAVED PORTFOLIOS</Label>
              <button onClick={() => setLoadPanelOpen(false)} className="text-text-muted hover:text-text-primary">
                <X size={13} />
              </button>
            </div>
            {savedPortfolios.length === 0 ? (
              <p className="text-text-muted text-xs">No saved portfolios yet.</p>
            ) : (
              <div className="space-y-2">
                {savedPortfolios.map((pf) => (
                  <div key={pf.id} className="flex items-center justify-between p-2.5 bg-bg-tertiary rounded-md border border-bg-border">
                    <div>
                      <div className="text-text-primary text-xs font-medium">{pf.name}</div>
                      <div className="text-text-muted text-xs mt-0.5">
                        {pf.method} — {pf.tickers.join(", ")} — {pf.capital.toLocaleString()}€
                      </div>
                      {pf.result && (
                        <div className="text-text-secondary text-xs mt-0.5">
                          Sharpe: {formatNumber(pf.result.metrics.sharpe_ratio, 3)} |
                          Ret: {formatPercent(pf.result.metrics.expected_annual_return)} |
                          Vol: {formatPercent(pf.result.metrics.annual_volatility)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadPortfolio(pf)}
                        className="text-xs text-accent-blue hover:text-orange-600 transition-colors"
                      >
                        LOAD
                      </button>
                      <button
                        onClick={() => deletePortfolio(pf.id)}
                        className="text-text-muted hover:text-accent-red transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONFIGURATION PANEL (RETRACTABLE HEADER) */}
        <div className="bg-bg-secondary border border-bg-border rounded-md shadow-card">
          <button
            type="button"
            onClick={() => setParamsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-text-primary text-xs uppercase tracking-widest hover:text-accent-blue transition-colors"
          >
            <span className="font-semibold flex items-center gap-2">
              <BarChart2 size={14} /> PORTFOLIO CONFIGURATION
            </span>
            {paramsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {paramsOpen && (
            <div className="px-5 pb-5 pt-2 border-t border-bg-border grid grid-cols-12 gap-6">
              {/* Left: Tickers & Top 20% */}
              <div className="col-span-5 space-y-4">
                <Label>ASSET UNIVERSE</Label>
                <div className="flex gap-2">
                  <input
                    {...register("tickerInput")}
                    placeholder="Add ticker..."
                    className="flex-1 bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue focus:shadow-glow uppercase placeholder:normal-case placeholder:text-text-muted transition-all"
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
                    onClick={() => {
                      addTicker(watch("tickerInput"));
                      setValue("tickerInput", "");
                    }}
                    className="px-3 bg-accent-blue hover:bg-orange-600 rounded-md transition-colors flex items-center justify-center"
                  >
                    <Plus size={14} className="text-black" />
                  </button>
                </div>
                
                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="checkbox" 
                    id="topScored" 
                    checked={useTopScored} 
                    onChange={(e) => setUseTopScored(e.target.checked)} 
                    className="accent-accent-blue w-3.5 h-3.5 rounded border-bg-border bg-bg-tertiary"
                  />
                  <label htmlFor="topScored" className="text-xs text-text-secondary cursor-pointer select-none hover:text-text-primary transition-colors">
                    Include Top 20% Scored Assets
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                  {tickers.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1.5 px-2 py-1 bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs"
                    >
                      {t}
                      <button onClick={() => removeTicker(t)} className="text-text-muted hover:text-accent-red transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {useTopScored && (
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue rounded-md text-xs font-medium">
                      + TOP 20%
                    </span>
                  )}
                </div>
              </div>

              {/* Right: Parameters Form */}
              <div className="col-span-7 flex flex-col justify-between">
                <form id="opt-form" onSubmit={handleSubmit((d) => optimize.mutate(d))} className="space-y-4">
                  <Label>OPTIMIZATION PARAMETERS</Label>
                  <div className="grid grid-cols-6 gap-4">
                    <div className="space-y-1 col-span-1">
                      <label className="text-text-muted text-xs">Method</label>
                      <select
                        {...register("method")}
                        className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-2.5 py-1.5 focus:outline-none focus:border-accent-blue transition-all"
                      >
                        {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <NumberField label="Capital (€)" name="capital" register={register} />
                    <NumberField label="Min Weight" name="min_weight" register={register} step={0.01} />
                    <NumberField label="Max Weight" name="max_weight" register={register} step={0.01} />
                    <NumberField label="Risk Aversion" name="risk_aversion" register={register} step={0.1} />
                    <div className="space-y-1">
                      <label className="text-text-muted text-xs">Max Assets</label>
                      <input
                        type="number"
                        min={2}
                        max={50}
                        step={1}
                        placeholder="All"
                        {...register("max_assets", {
                          setValueAs: (v) => (v === "" || v === null) ? null : Number(v),
                        })}
                        className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-2.5 py-1.5 focus:outline-none focus:border-accent-blue transition-all placeholder:text-text-muted"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={optimize.isPending || (tickers.length === 0 && !useTopScored)}
                      className="flex items-center justify-center gap-2 px-6 py-2 bg-accent-blue hover:bg-orange-600 text-black text-xs font-bold tracking-wider rounded-md disabled:opacity-50 transition-all hover:shadow-glow"
                    >
                      {optimize.isPending ? <LoadingSpinner size="sm" /> : <Play size={14} />}
                      {optimize.isPending ? "OPTIMIZING..." : "RUN OPTIMIZATION"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-bg-border">
          {(["optimize", "montecarlo", "compare", "performance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "pb-2.5 text-xs tracking-widest uppercase transition-colors border-b-2 -mb-px",
                activeTab === t
                  ? "text-accent-blue border-accent-blue"
                  : "text-text-secondary border-transparent hover:text-text-primary"
              )}
            >
              {t === "optimize" ? "OPTIMIZATION ENGINE"
               : t === "montecarlo" ? "MONTE CARLO / VAR"
               : t === "compare" ? "COMPARE PORTFOLIOS"
               : "TRACK PERFORMANCE"}
            </button>
          ))}
        </div>

        {/* ---- OPTIMIZE TAB ---- */}
        {activeTab === "optimize" && (
          <div className="space-y-4">
              {optimize.isPending && (
                <div className="flex items-center justify-center h-64">
                  <LoadingSpinner label="OPTIMIZING PORTFOLIO..." size="lg" />
                </div>
              )}

              {optResult && !optimize.isPending && (
                <>
                  {/* Primary metrics row */}
                  <div className="grid grid-cols-3 gap-4">
                    <MetricCard label="EXPECTED RETURN (ANN)" value={formatPercent(optResult.metrics.expected_annual_return)} accentColor="green" />
                    <MetricCard label="VOLATILITY (ANN)"      value={formatPercent(optResult.metrics.annual_volatility)}      accentColor="orange" />
                    <MetricCard label="SHARPE RATIO"          value={formatNumber(optResult.metrics.sharpe_ratio, 4)}          accentColor="blue" />
                  </div>

                  {/* Extended risk metrics */}
                  <div className="grid grid-cols-4 gap-4">
                    <MetricCard label="SORTINO RATIO"  value={formatNumber(optResult.metrics.sortino_ratio, 4)}  accentColor="blue" />
                    <MetricCard label="CALMAR RATIO"   value={formatNumber(optResult.metrics.calmar_ratio, 4)}   accentColor="blue" />
                    <MetricCard label="MAX DRAWDOWN"   value={formatPercent(optResult.metrics.max_drawdown)}     accentColor="red" />
                    <MetricCard label="BETA (vs S&P)"  value={formatNumber(optResult.metrics.beta, 4)}           accentColor="orange" />
                  </div>

                  {/* Allocation + capital table */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
                      <Label>WEIGHT ALLOCATION</Label>
                      <PlotlyChart
                        data={pieData}
                        layout={{ showlegend: true, margin: { l: 10, r: 10, t: 20, b: 10 } }}
                        height={280}
                      />
                    </div>
                    <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card max-h-[330px] overflow-y-auto">
                      <Label>CAPITAL ALLOCATION</Label>
                      <table className="terminal-table mt-2">
                        <thead>
                          <tr>
                            <th>TICKER</th>
                            <th>WEIGHT</th>
                            <th>AMOUNT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(optResult.weights)
                            .sort(([, a], [, b]) => b - a)
                            .map(([t, w]) => (
                              <tr key={t}>
                                <td className="text-accent-blue">{t}</td>
                                <td>{formatPercent(w)}</td>
                                <td>{formatCurrency(optResult.allocation_eur[t])}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Diversification charts */}
                  {optResult.diversification && (
                    <div className="grid grid-cols-2 gap-4">
                      <DiversificationPie
                        title="SECTOR BREAKDOWN"
                        data={optResult.diversification.sectors}
                      />
                      <DiversificationPie
                        title="GEOGRAPHIC BREAKDOWN"
                        data={optResult.diversification.countries}
                      />
                    </div>
                  )}
                </>
              )}

              {!optResult && !optimize.isPending && (
              <div className="flex items-center justify-center h-64 text-text-muted text-xs border border-dashed border-bg-border rounded-md bg-bg-secondary/50">
                Configure parameters in the header panel and run optimization.
                </div>
              )}
          </div>
        )}

        {/* ---- MONTE CARLO TAB ---- */}
        {activeTab === "montecarlo" && (
          <div className="space-y-4">
            {!optResult ? (
              <div className="text-text-secondary text-xs p-6 bg-bg-secondary border border-bg-border rounded-md text-center shadow-card">
                Run portfolio optimization first to enable Monte Carlo simulation.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-text-secondary text-xs">
                    Using weights from last optimization — {optResult.method} — {tickers.length} assets.
                  </p>
                  <button
                    onClick={() => monteCarlo.mutate()}
                    disabled={monteCarlo.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-orange-600 text-black text-xs font-semibold rounded-md disabled:opacity-50 transition-all hover:shadow-glow"
                  >
                    {monteCarlo.isPending ? <LoadingSpinner size="sm" /> : <BarChart2 size={12} />}
                    {monteCarlo.isPending ? "SIMULATING..." : "RUN 1,000 SIMULATIONS"}
                  </button>
                </div>

                {monteCarlo.isPending && <SkeletonChart height={400} />}

                {mcResult && !monteCarlo.isPending && (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      <MetricCard label="EXPECTED FINAL VALUE" value={formatCurrency(mcResult.risk_metrics.expected_final_value)} accentColor="green" />
                      <MetricCard label="VaR 95% (1Y)"         value={`-${formatCurrency(mcResult.risk_metrics.var_95)}`}         accentColor="red" />
                      <MetricCard label="CVaR 95% (1Y)"        value={`-${formatCurrency(mcResult.risk_metrics.cvar_95)}`}        accentColor="red" />
                      <MetricCard label="WORST CASE P5"        value={formatCurrency(mcResult.risk_metrics.worst_case_p5)}        accentColor="orange" />
                    </div>
                    <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
                      <PlotlyChart
                        data={mcData}
                        layout={{
                          yaxis: { title: { text: "Portfolio Value (EUR)", font: { size: 10 } } },
                          xaxis: { title: { text: "Trading Days", font: { size: 10 } } },
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

        {/* ---- COMPARE TAB ---- */}
        {activeTab === "compare" && (
          <div className="space-y-4">
            {savedPortfolios.length < 2 ? (
              <div className="text-text-secondary text-xs p-6 bg-bg-secondary border border-bg-border rounded-md text-center shadow-card">
                Save at least 2 optimized portfolios to compare them.
              </div>
            ) : (
              <>
                <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
                  <Label>SELECT PORTFOLIOS TO COMPARE</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {savedPortfolios.map((pf) => (
                      <button
                        key={pf.id}
                        onClick={() =>
                          setCompareSel((prev) =>
                            prev.includes(pf.id)
                              ? prev.filter((id) => id !== pf.id)
                              : [...prev, pf.id]
                          )
                        }
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-md border transition-all",
                          compareSel.includes(pf.id)
                            ? "bg-accent-blue/10 border-accent-blue text-accent-blue"
                            : "bg-bg-tertiary border-bg-border text-text-secondary hover:border-accent-blue hover:text-text-primary"
                        )}
                      >
                        {pf.name}
                      </button>
                    ))}
                  </div>
                </div>

                {comparePortfolios.length >= 2 && (
                  <>
                    {/* Summary table */}
                    <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
                      <Label>PERFORMANCE COMPARISON</Label>
                      <table className="terminal-table mt-2">
                        <thead>
                          <tr>
                            <th>PORTFOLIO</th>
                            <th>METHOD</th>
                            <th>RETURN</th>
                            <th>VOL</th>
                            <th>SHARPE</th>
                            <th>SORTINO</th>
                            <th>CALMAR</th>
                            <th>MAX DD</th>
                            <th>BETA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparePortfolios.map((pf, i) => (
                            <tr key={pf.id}>
                              <td>
                                <span className="font-medium" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>
                                  {pf.name}
                                </span>
                              </td>
                              <td className="text-text-secondary">{pf.method}</td>
                              <td className="text-accent-green">{formatPercent(pf.result!.metrics.expected_annual_return)}</td>
                              <td className="text-accent-orange">{formatPercent(pf.result!.metrics.annual_volatility)}</td>
                              <td>{formatNumber(pf.result!.metrics.sharpe_ratio, 3)}</td>
                              <td>{formatNumber(pf.result!.metrics.sortino_ratio, 3)}</td>
                              <td>{formatNumber(pf.result!.metrics.calmar_ratio, 3)}</td>
                              <td className="text-accent-red">{formatPercent(pf.result!.metrics.max_drawdown)}</td>
                              <td>{formatNumber(pf.result!.metrics.beta, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Bar chart comparison */}
                    <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
                      <Label>GROUPED METRICS CHART</Label>
                      <PlotlyChart
                        data={compareData}
                        layout={{
                          barmode: "group",
                          yaxis: { title: { text: "Value (%)", font: { size: 10 } } },
                          legend: { orientation: "h", y: -0.2 },
                        }}
                        height={360}
                      />
                    </div>
                  </>
                )}

                {comparePortfolios.length < 2 && compareSel.length > 0 && (
                  <p className="text-text-muted text-xs text-center">
                    Select at least 2 portfolios to display comparison.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {/* ---- PERFORMANCE TAB ---- */}
        {activeTab === "performance" && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
              <Label>TRACK PORTFOLIO PERFORMANCE</Label>
              <div className="grid grid-cols-12 gap-4 mt-2 items-end">
                <div className="col-span-5 space-y-1">
                  <label className="text-text-muted text-xs">SAVED PORTFOLIO</label>
                  {savedPortfolios.length === 0 ? (
                    <p className="text-text-muted text-xs py-1.5">No saved portfolios. Optimize and save one first.</p>
                  ) : (
                    <select
                      value={perfPortfolioId}
                      onChange={(e) => { setPerfPortfolioId(e.target.value); setPerfResult(null); }}
                      className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-2.5 py-1.5 focus:outline-none focus:border-accent-blue transition-all"
                    >
                      <option value="">-- select --</option>
                      {savedPortfolios.map((pf) => (
                        <option key={pf.id} value={pf.id}>
                          {pf.name} ({pf.method})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="col-span-3 space-y-1">
                  <label className="text-text-muted text-xs">START DATE (t)</label>
                  <input
                    type="date"
                    value={perfStartDate}
                    onChange={(e) => { setPerfStartDate(e.target.value); setPerfResult(null); }}
                    className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-2.5 py-1.5 focus:outline-none focus:border-accent-blue transition-all"
                  />
                </div>
                <div className="col-span-4 flex justify-end">
                  <button
                    onClick={() => performance.mutate()}
                    disabled={performance.isPending || !perfPortfolioId}
                    className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:bg-orange-600 text-black text-xs font-semibold rounded-md disabled:opacity-50 transition-all hover:shadow-glow"
                  >
                    {performance.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
                    {performance.isPending ? "LOADING..." : "TRACK"}
                  </button>
                </div>
              </div>
            </div>

            {performance.isPending && <SkeletonChart height={380} />}

            {perfResult && !performance.isPending && (
              <>
                {/* Always-visible metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard
                    label="TOTAL RETURN"
                    value={formatPercent(perfResult.metrics.total_return)}
                    accentColor={perfResult.metrics.total_return >= 0 ? "green" : "red"}
                  />
                  <MetricCard
                    label="CURRENT VALUE"
                    value={formatCurrency(perfResult.metrics.current_value)}
                    accentColor="blue"
                  />
                  <MetricCard
                    label="MAX DRAWDOWN"
                    value={formatPercent(perfResult.metrics.max_drawdown)}
                    accentColor="red"
                  />
                </div>

                {/* Annualized metrics (>= 30 days) */}
                {perfResult.metrics.ann_return !== undefined && (
                  <div className="grid grid-cols-4 gap-4">
                    <MetricCard
                      label="ANN. RETURN"
                      value={formatPercent(perfResult.metrics.ann_return)}
                      accentColor={perfResult.metrics.ann_return >= 0 ? "green" : "red"}
                    />
                    <MetricCard
                      label="ANN. VOLATILITY"
                      value={formatPercent(perfResult.metrics.ann_volatility!)}
                      accentColor="orange"
                    />
                    {perfResult.metrics.beta !== undefined && (
                      <MetricCard label="BETA (vs SPY)" value={formatNumber(perfResult.metrics.beta, 3)} accentColor="orange" />
                    )}
                    {/* Placeholder for grid alignment when beta absent */}
                    {perfResult.metrics.beta === undefined && <div />}
                    <div className="text-text-muted text-xs flex items-center justify-center bg-bg-secondary border border-dashed border-bg-border rounded-md">
                      {perfResult.n_days < 252
                        ? `Sharpe/Sortino/Calmar available after 252 trading days (${252 - perfResult.n_days} remaining)`
                        : null}
                    </div>
                  </div>
                )}

                {/* Full ratios (>= 252 days) */}
                {perfResult.metrics.sharpe_ratio !== undefined && (
                  <div className="grid grid-cols-3 gap-4">
                    <MetricCard label="SHARPE RATIO"  value={formatNumber(perfResult.metrics.sharpe_ratio, 4)}  accentColor="blue" />
                    <MetricCard label="SORTINO RATIO" value={formatNumber(perfResult.metrics.sortino_ratio!, 4)} accentColor="blue" />
                    <MetricCard label="CALMAR RATIO"  value={formatNumber(perfResult.metrics.calmar_ratio!, 4)}  accentColor="blue" />
                  </div>
                )}

                {/* Performance chart */}
                <div className="bg-bg-secondary border border-bg-border rounded-md p-4 shadow-card">
                  <Label>
                    PORTFOLIO VS SPY — since {perfStartDate} ({perfResult.n_days} trading days)
                  </Label>
                  <PlotlyChart
                    data={[
                      {
                        type: "scatter",
                        mode: "lines",
                        x: perfResult.dates,
                        y: perfResult.portfolio_values,
                        name: savedPortfolios.find((p) => p.id === perfPortfolioId)?.name ?? "Portfolio",
                        line: { color: "#F97316", width: 2.5 },
                        hovertemplate: "%{x}: %{y:,.0f}<extra></extra>",
                      },
                      {
                        type: "scatter",
                        mode: "lines",
                        x: perfResult.dates,
                        y: perfResult.benchmark_values,
                        name: "SPY",
                        line: { color: "#60A5FA", width: 1.5, dash: "dot" },
                        hovertemplate: "%{x}: %{y:,.0f}<extra></extra>",
                      },
                    ]}
                    layout={{
                      yaxis: { title: { text: "Value (EUR)", font: { size: 10 } } },
                      xaxis: { title: { text: "Date", font: { size: 10 } } },
                      legend: { orientation: "h", y: -0.2 },
                    }}
                    height={400}
                  />
                </div>

                {/* Per-asset weight reminder */}
                {(() => {
                  const pf = savedPortfolios.find((p) => p.id === perfPortfolioId);
                  return pf?.result ? (
                    <div className="bg-bg-secondary border border-bg-border rounded-md p-3 shadow-card">
                      <Label>PORTFOLIO COMPOSITION AT t={perfStartDate}</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {Object.entries(pf.result.weights)
                          .sort(([, a], [, b]) => b - a)
                          .map(([tk, w]) => (
                            <span key={tk} className="px-2 py-1 bg-bg-tertiary border border-bg-border rounded text-xs">
                              <span className="text-accent-blue">{tk}</span>
                              <span className="text-text-muted ml-1">{formatPercent(w)}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </>
            )}

            {!perfResult && !performance.isPending && (
              <div className="flex items-center justify-center h-48 text-text-muted text-xs border border-dashed border-bg-border rounded-md bg-bg-secondary/50">
                Select a saved portfolio and a start date, then click TRACK.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg-secondary border border-bg-border rounded-lg p-6 shadow-card w-80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-text-primary text-sm font-semibold tracking-widest">SAVE PORTFOLIO</div>
              <button onClick={() => setSaveModalOpen(false)} className="text-text-muted hover:text-text-primary">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-text-muted text-xs">PORTFOLIO NAME</label>
              <input
                autoFocus
                value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePortfolio()}
                placeholder="e.g. Tech Growth Q2"
                className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue focus:shadow-glow transition-all"
              />
            </div>

            {optResult && (
              <div className="bg-bg-tertiary rounded-md p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Tickers</span>
                  <span className="text-text-secondary">{tickers.join(", ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Return</span>
                  <span className="text-accent-green">{formatPercent(optResult.metrics.expected_annual_return)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Sharpe</span>
                  <span className="text-text-primary">{formatNumber(optResult.metrics.sharpe_ratio, 3)}</span>
                </div>
              </div>
            )}

            <button
              onClick={savePortfolio}
              disabled={!saveNameInput.trim()}
              className="w-full py-2.5 bg-accent-blue hover:bg-orange-600 text-black text-xs font-semibold rounded-md disabled:opacity-40 transition-all"
            >
              SAVE
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
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-text-secondary text-xs uppercase tracking-widest mb-2">{children}</div>;
}

function NumberField({
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
      <label className="text-text-muted text-xs">{label}</label>
      <input
        {...register(name as never, { valueAsNumber: true })}
        type="number"
        step={step}
        className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-2.5 py-1.5 focus:outline-none focus:border-accent-blue transition-all"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diversification pie chart helper
// ---------------------------------------------------------------------------
function DiversificationPie({ title, data }: { title: string; data: Record<string, number> }) {
  const allEntries = Object.entries(data)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort(([, a], [, b]) => b - a);

  if (allEntries.length === 0) return null;

  const hasReal = allEntries.some(([k]) => k !== "Unknown");
  const entries = hasReal ? allEntries.filter(([k]) => k !== "Unknown") : allEntries;

  const labels = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);

  return (
    <div className="bg-bg-secondary border border-bg-border rounded-md p-3 shadow-card">
      <Label>{title}</Label>
      <PlotlyChart
        data={[{
          type: "pie" as const,
          labels,
          values,
          marker: { colors: PIE_COLORS },
          textfont: { size: 10 },
          hole: 0.4,
          hovertemplate: "%{label}: %{percent}<extra></extra>",
        }]}
        layout={{ showlegend: true, margin: { l: 10, r: 10, t: 20, b: 10 } }}
        height={220}
      />
    </div>
  );
}

function buildMcChartData(mc: MonteCarloResult) {
  const days = mc.days;
  const p = mc.percentiles;
  const commonLine = { type: "scatter" as const, mode: "lines" as const };

  return [
    { ...commonLine, x: days, y: p.p5,  name: "P5",     line: { color: "#FF4136", width: 1, dash: "dot" as const } },
    { ...commonLine, x: days, y: p.p25, name: "P25",    line: { color: "#F5A623", width: 1 } },
    { ...commonLine, x: days, y: p.p50, name: "MEDIAN", line: { color: "#FFFFFF", width: 2 } },
    { ...commonLine, x: days, y: p.p75, name: "P75",    line: { color: "#F5A623", width: 1 } },
    { ...commonLine, x: days, y: p.p95, name: "P95",    line: { color: "#2ECC40", width: 1, dash: "dot" as const } },
    {
      ...commonLine,
      x: [...days, ...days.slice().reverse()],
      y: [...p.p25, ...p.p75.slice().reverse()],
      fill: "toself" as const,
      fillcolor: "rgba(245,166,35,0.08)",
      line: { width: 0 },
      name: "IQR",
      showlegend: false,
      hoverinfo: "skip" as const,
    },
  ];
}
