/**
 * TypeScript types mirroring the FastAPI response schemas.
 * Keep in sync with backend/schemas/*.py.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------
export interface ApiError {
  status: "error";
  detail: string;
}

// ---------------------------------------------------------------------------
// Macro
// ---------------------------------------------------------------------------
export interface MacroRegionData {
  Rate: string;
  GDP: string;
  Unemp: string;
}

export interface MacroIndicators {
  US: MacroRegionData;
  EU: MacroRegionData;
  JP: MacroRegionData;
}

export interface MarketData {
  dates: string[];
  data: Record<string, number[]>;
}

export interface RegimeData {
  dates: string[];
  sp500: number[];
  regimes: number[];
  prob_bull: number[];
  prob_bear: number[];
  current_regime: number;
  current_regime_label: string;
  current_prob_bull: number;
}

export interface GarchData {
  ticker: string;
  realized_vol_30d: number;
  conditional_vol_current: number;
  forecast_t1: number;
  dates: string[];
  conditional_vol_series: number[];
  abs_returns_dates: string[];
  abs_returns_series: number[];
}

export interface CotEntry {
  ASSET?: string;
  "MARKET ASSET"?: string;
  SENTIMENT: string;
  NET_POSITION: number;
}

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  banner_image?: string;
  summary: string;
  overall_sentiment_label: string;
  overall_sentiment_score: number;
  time_published: string;
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------
export interface OptimizationRequest {
  tickers: string[];
  method: "Markowitz" | "HRP" | "Max_Sharpe" | "Min_Vol" | "Risk_Parity";
  capital: number;
  min_weight?: number;
  max_weight?: number;
  risk_aversion?: number;
}

export interface OptimizationResult {
  method: string;
  tickers: string[];
  weights: Record<string, number>;
  allocation_eur: Record<string, number>;
  metrics: {
    expected_annual_return: number;
    annual_volatility: number;
    sharpe_ratio: number;
  };
}

export interface MonteCarloRequest {
  tickers: string[];
  weights: number[];
  capital: number;
  n_simulations?: number;
  horizon_days?: number;
}

export interface MonteCarloResult {
  horizon_days: number;
  n_simulations: number;
  initial_capital: number;
  days: number[];
  percentiles: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  risk_metrics: {
    var_95: number;
    cvar_95: number;
    expected_final_value: number;
    worst_case_p5: number;
  };
}

// ---------------------------------------------------------------------------
// Screener
// ---------------------------------------------------------------------------
export interface ScreenerCriterion {
  op: ">=" | "<=" | ">" | "<" | "==";
  val: number;
}

export interface ScreenerRunRequest {
  criteria: Record<string, ScreenerCriterion>;
}

export interface ScreenerResult {
  count: number;
  assets: Record<string, unknown>[];
}

export interface Preset {
  criteria: Record<string, ScreenerCriterion>;
}

// ---------------------------------------------------------------------------
// Equity
// ---------------------------------------------------------------------------
export interface PriceHistory {
  ticker: string;
  period: string;
  interval: string;
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  sma_50: (number | null)[];
  sma_200: (number | null)[];
}

export interface EquityFundamentals {
  ticker: string;
  longName?: string;
  sector?: string;
  industry?: string;
  currentPrice?: number;
  marketCap?: number;
  forwardPE?: number;
  trailingPE?: number;
  priceToBook?: number;
  returnOnEquity?: number;
  dividendYield?: number;
  earningsGrowth?: number;
  beta?: number;
  [key: string]: unknown;
}

export interface ReturnsStats {
  ticker: string;
  ann_return: number;
  ann_volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  cagr: number;
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------
export interface ScorerResult {
  count: number;
  assets: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export interface UserPreferences {
  accent_color: string;
  default_capital: number;
  currency: string;
  chart_template: string;
  decimals: number;
  ui_density: string;
}
