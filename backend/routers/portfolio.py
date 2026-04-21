"""
Portfolio optimization and risk management router.
Endpoints: optimize, monte-carlo, stress-test, portfolio CRUD.
"""

import json
import sqlite3
import sys
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Depends
from ..auth.jwt_handler import get_current_user
from ..plan_gate import check_optimization_method, check_portfolio_count
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.pf_engine.portfolio_optimization.portfolio_optimizer import Portfolio
from src.pf_engine.portfolio_optimization.hrp_engine import post_process_weights
from src.pf_engine.risk_management.monte_carlo_simulation import (
    run_monte_carlo_portfolio,
    calculate_var_cvar_simple,
)
from ..schemas.portfolio import OptimizationRequest, MonteCarloRequest, PerformanceRequest
from ..cache.memory_cache import cache

# ---------------------------------------------------------------------------
# Lightweight SQLite helpers (independent of Streamlit DatabaseManager)
# ---------------------------------------------------------------------------
_PF_DB_PATH = ROOT / "data" / "portfolios_v2.db"
_PF_DB_PATH.parent.mkdir(parents=True, exist_ok=True)


_TRACKER_DB_PATH = ROOT / "data" / "tracker_v2.db"
_TRACKER_DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _init_pf_db() -> None:
    with sqlite3.connect(_PF_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS portfolios (
                id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                user_id    TEXT NOT NULL DEFAULT '',
                name       TEXT NOT NULL,
                tickers    TEXT NOT NULL,
                weights    TEXT NOT NULL,
                capital    REAL NOT NULL,
                method     TEXT NOT NULL DEFAULT 'EqualWeights',
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, name)
            )
        """)
        for col, ddl in [
            ("user_id", "ALTER TABLE portfolios ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"),
            ("method",  "ALTER TABLE portfolios ADD COLUMN method TEXT NOT NULL DEFAULT 'EqualWeights'"),
        ]:
            try:
                conn.execute(ddl)
            except Exception:
                pass
        conn.commit()


def _init_tracker_db() -> None:
    with sqlite3.connect(_TRACKER_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tracker_portfolios (
                id         TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL,
                name       TEXT NOT NULL,
                data       TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, name)
            )
        """)
        conn.commit()


_init_pf_db()
_init_tracker_db()


@contextmanager
def _pf_db():
    conn = sqlite3.connect(_PF_DB_PATH)
    try:
        yield conn
    finally:
        conn.close()

logger = logging.getLogger(__name__)
router = APIRouter()

_YFINANCE_TICKER_MAP = {
    "BRK.B": "BRK-B",
    "BRK.A": "BRK-A",
    "BF.B": "BF-B",
}

# Maps frontend method names to Portfolio.Optimize() accepted values
_METHOD_MAP: dict[str, str] = {
    "HRP": "HRP",
    "MeanVar": "MeanVar",
    "MinVol": "MinVol",
    "EqualWeights": "EqualWeights",
    # Legacy aliases
    "Markowitz": "MeanVar",
    "Max_Sharpe": "HRP",
    "Min_Vol": "MinVol",
    "Risk_Parity": "EqualWeights",
}


def _sanitize_tickers(tickers: list[str]) -> list[str]:
    return [_YFINANCE_TICKER_MAP.get(t, t) for t in tickers]


# ---------------------------------------------------------------------------
# POST /portfolio/optimize
# ---------------------------------------------------------------------------
@router.post("/optimize")
def optimize_portfolio(req: OptimizationRequest, current_user: dict = Depends(get_current_user)) -> Any:
    """
    Runs portfolio optimization (HRP, Markowitz, Max Sharpe, Min Vol, Risk Parity).
    Returns weights, allocation in base currency, and key risk metrics.
    """
    engine_method = _METHOD_MAP.get(req.method, req.method)
    # Enforce plan-level method access (raises 402 if not allowed)
    check_optimization_method(current_user["sub"], engine_method)

    tickers = _sanitize_tickers(req.tickers)
    cache_key = f"pf_opt_{'-'.join(sorted(tickers))}_{req.method}_{req.capital}_{req.min_weight}_{req.max_weight}_{req.risk_aversion}_{req.max_assets}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        portfolio = Portfolio(
            tickers=tickers,
            capital=req.capital,
            min_weight=req.min_weight,
            max_weight=req.max_weight,
            risk_aversion=req.risk_aversion,
            max_assets=req.max_assets,
        )
        weights = portfolio.Optimize(method=engine_method)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Portfolio optimization error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Optimization engine failed.")

    if weights is None or len(weights) == 0:
        raise HTTPException(status_code=422, detail="Optimizer returned empty weights. Check ticker validity.")

    processed = post_process_weights(
        weights,
        None,  # no sector constraints in this context
        max_asset_weight=req.max_weight,
        min_weight=req.min_weight,
    )

    # Use the actual tickers from the portfolio (TOP20 may have been expanded,
    # and some tickers may have been dropped due to missing price data).
    # req.tickers / tickers still contains the literal "TOP20" placeholder —
    # never use it to build the response after this point.
    effective_tickers = processed.index.tolist()

    allocation = {t: round(w * req.capital, 2) for t, w in processed.items()}
    weights_dict = {t: round(w, 6) for t, w in processed.items()}

    # Portfolio-level metrics
    # Align weights with the returns columns — processed is indexed by
    # effective_tickers which matches portfolio.returns columns exactly.
    daily_rets: pd.DataFrame = portfolio.returns
    # Reindex processed to match returns columns in case order differs
    processed_aligned = processed.reindex(daily_rets.columns).fillna(0.0)
    processed_aligned /= processed_aligned.sum()
    w_arr = processed_aligned.values
    mu_vec = portfolio.mu.reindex(daily_rets.columns).fillna(0.0).values
    cov = daily_rets.cov().values * 252
    port_ret = float(np.dot(w_arr, mu_vec))
    port_vol = float(np.sqrt(w_arr @ cov @ w_arr))
    sharpe = (port_ret - 0.04) / port_vol if port_vol > 0 else 0.0

    # Portfolio daily returns series
    port_daily = daily_rets.values @ w_arr
    ann_factor = np.sqrt(252)

    # Sortino — downside deviation only
    downside = port_daily[port_daily < 0]
    downside_dev = float(np.std(downside) * ann_factor) if len(downside) > 5 else port_vol
    sortino = (port_ret - 0.04) / downside_dev if downside_dev > 0 else 0.0

    # Calmar — annual return / max drawdown (absolute)
    cum = (1 + pd.Series(port_daily)).cumprod()
    rolling_max = cum.cummax()
    max_dd = float(((cum - rolling_max) / rolling_max).min())
    calmar = (port_ret / abs(max_dd)) if max_dd < 0 else 0.0

    # Beta vs S&P 500: estimate from cached portfolio returns against SP500 proxy
    # Avoid live yfinance call here — it blocks under rate limiting.
    beta = 0.0
    try:
        # Use the SP500 cached file if it exists
        import glob as _glob
        sp_files = sorted(_glob.glob(str(ROOT / "data" / "cache" / "logreturns_*GSPC*")))
        if sp_files:
            sp_rets = pd.read_csv(sp_files[-1], index_col="Date", parse_dates=True).iloc[:, 0]
            common = daily_rets.index.intersection(sp_rets.index)
            if len(common) > 30:
                p_aligned = daily_rets.loc[common].values @ w_arr
                m_aligned = sp_rets.loc[common].values
                cov_pm = float(np.cov(p_aligned, m_aligned)[0, 1])
                var_m = float(np.var(m_aligned))
                beta = cov_pm / var_m if var_m > 0 else 0.0
    except Exception:
        pass

    # Sector / country diversification
    # Step 1: load from CSV cache (final_scored_assets > screened_assets)
    sectors: dict[str, float] = {}
    countries: dict[str, float] = {}
    _meta: dict[str, dict] = {}
    for _meta_path in [ROOT / "data" / "equity_scored.csv",
                       ROOT / "data" / "final_scored_assets.csv",
                       ROOT / "data" / "screened_assets.csv"]:
        if _meta_path.exists():
            try:
                _raw_meta = pd.read_csv(_meta_path)
                _wanted = ["Ticker", "Sector", "Country"]
                _cols = [c for c in _wanted if c in _raw_meta.columns]
                _df_meta = _raw_meta[_cols].dropna(subset=["Ticker"])
                for _, row in _df_meta.iterrows():
                    t = str(row["Ticker"]).strip()
                    if t and t not in _meta:
                        _meta[t] = row.to_dict()
            except Exception:
                pass

    # Step 2: identify tickers with missing sector/country — fetch via yfinance
    import concurrent.futures as _cf

    _unknown_syms = [
        sym for sym in processed
        if not (_meta.get(sym, {}).get("Sector") or "").strip()
        or not (_meta.get(sym, {}).get("Country") or "").strip()
        or (_meta.get(sym, {}).get("Sector") or "").strip() in ("Unknown", "nan")
        or (_meta.get(sym, {}).get("Country") or "").strip() in ("Unknown", "nan")
    ]

    if _unknown_syms:
        def _lookup_yf(sym: str) -> tuple[str, str, str]:
            try:
                info = yf.Ticker(sym).info or {}
                return sym, (info.get("sector") or "Unknown"), (info.get("country") or "Unknown")
            except Exception:
                return sym, "Unknown", "Unknown"
        with _cf.ThreadPoolExecutor(max_workers=10) as _pool:
            for sym, sec, cty in _pool.map(_lookup_yf, _unknown_syms):
                if sym not in _meta:
                    _meta[sym] = {}
                if not (_meta[sym].get("Sector") or "").strip() or (_meta[sym].get("Sector") or "Unknown") in ("Unknown", "nan"):
                    _meta[sym]["Sector"] = sec
                if not (_meta[sym].get("Country") or "").strip() or (_meta[sym].get("Country") or "Unknown") in ("Unknown", "nan"):
                    _meta[sym]["Country"] = cty

    # Step 3: aggregate weighted sector/country
    for sym, weight in processed.items():
        info = _meta.get(sym, {})
        sector  = (str(info.get("Sector",  "") or "")).strip() or "Unknown"
        country = (str(info.get("Country", "") or "")).strip() or "Unknown"
        if sector  == "nan": sector  = "Unknown"
        if country == "nan": country = "Unknown"
        sectors[sector]    = sectors.get(sector, 0.0)   + weight
        countries[country] = countries.get(country, 0.0) + weight

    result = {
        "method": req.method,
        "tickers": effective_tickers,
        "weights": weights_dict,
        "allocation_eur": allocation,
        "metrics": {
            "expected_annual_return": round(port_ret, 4),
            "annual_volatility": round(port_vol, 4),
            "sharpe_ratio": round(sharpe, 4),
            "sortino_ratio": round(sortino, 4),
            "calmar_ratio": round(calmar, 4),
            "max_drawdown": round(max_dd, 4),
            "beta": round(beta, 4),
        },
        "diversification": {
            "sectors":   {k: round(v, 4) for k, v in sectors.items()},
            "countries": {k: round(v, 4) for k, v in countries.items()},
        },
    }
    cache.set(cache_key, result, ttl=600)
    return result


# ---------------------------------------------------------------------------
# POST /portfolio/monte-carlo
# ---------------------------------------------------------------------------
@router.post("/monte-carlo")
def run_monte_carlo(req: MonteCarloRequest) -> Any:
    """
    Monte Carlo simulation with Cholesky decomposition on correlated GBM paths.
    Returns percentile paths (P5, P25, P50, P75, P95) and VaR/CVaR metrics.
    """
    tickers = _sanitize_tickers(req.tickers)
    if len(tickers) != len(req.weights):
        raise HTTPException(status_code=422, detail="tickers and weights must have equal length.")

    w_arr = np.array(req.weights, dtype=float)
    if not np.isclose(w_arr.sum(), 1.0, atol=1e-3):
        raise HTTPException(status_code=422, detail=f"Weights must sum to 1.0 (got {w_arr.sum():.4f}).")

    try:
        from src.data_managers.data_provider import get_historical_returns
        returns = get_historical_returns(tickers, period="10y", interval="1d")
        if returns is None or returns.empty:
            raise ValueError("No returns data available for the requested tickers.")
        # Reindex to requested tickers order and align weights
        returns = returns.reindex(columns=tickers, fill_value=np.nan).dropna()
        if len(returns) < 30:
            raise ValueError("Insufficient historical data (< 30 observations).")
        mu_vec = returns.mean().values * 252
        cov_matrix = returns.cov().values * 252
    except Exception as exc:
        logger.error("Data fetch for Monte Carlo failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"Market data unavailable for Monte Carlo: {exc}")

    try:
        sim_df = run_monte_carlo_portfolio(
            initial_capital=req.capital,
            weights=w_arr,
            mu_vec=mu_vec,
            cov_matrix=cov_matrix,
            horizon_days=req.horizon_days,
            n_simulations=req.n_simulations,
        )
    except Exception as exc:
        logger.error("Monte Carlo simulation error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Monte Carlo simulation failed.")

    final_vals = sim_df.iloc[-1]
    var_95, cvar_95 = calculate_var_cvar_simple(final_vals.values, initial_capital=req.capital)

    percentiles = sim_df.quantile([0.05, 0.25, 0.50, 0.75, 0.95], axis=1).T
    day_index = list(range(req.horizon_days + 1))

    return {
        "horizon_days": req.horizon_days,
        "n_simulations": req.n_simulations,
        "initial_capital": req.capital,
        "days": day_index,
        "percentiles": {
            "p5": percentiles[0.05].round(2).tolist(),
            "p25": percentiles[0.25].round(2).tolist(),
            "p50": percentiles[0.50].round(2).tolist(),
            "p75": percentiles[0.75].round(2).tolist(),
            "p95": percentiles[0.95].round(2).tolist(),
        },
        "risk_metrics": {
            "var_95": round(float(var_95), 2),
            "cvar_95": round(float(cvar_95), 2),
            "expected_final_value": round(float(final_vals.mean()), 2),
            "worst_case_p5": round(float(final_vals.quantile(0.05)), 2),
        },
    }


# ---------------------------------------------------------------------------
# Portfolio CRUD — user-scoped
# ---------------------------------------------------------------------------

class SavePortfolioRequest(BaseModel):
    name: str
    tickers: list[str]
    weights: list[float]
    capital: float
    method: str = "EqualWeights"


@router.get("/saved")
def list_saved_portfolios(user: dict = Depends(get_current_user)) -> Any:
    """Returns saved portfolios for the authenticated user."""
    try:
        with _pf_db() as conn:
            rows = conn.execute(
                "SELECT name, tickers, weights, capital, method, created_at FROM portfolios WHERE user_id = ? ORDER BY created_at DESC",
                (user["sub"],),
            ).fetchall()
        return [
            {
                "name": r[0],
                "tickers": json.loads(r[1]),
                "weights": json.loads(r[2]),
                "capital": r[3],
                "method": r[4] or "EqualWeights",
                "created_at": r[5],
            }
            for r in rows
        ]
    except Exception as exc:
        logger.error("DB read error (portfolios): %s", exc)
        raise HTTPException(status_code=500, detail="Database read failed.")


@router.post("/save")
def save_portfolio(req: SavePortfolioRequest, user: dict = Depends(get_current_user)) -> Any:
    """Persists portfolio to SQLite scoped to authenticated user. Enforces plan portfolio limit."""
    try:
        with _pf_db() as conn:
            existing_count = conn.execute(
                "SELECT COUNT(*) FROM portfolios WHERE user_id = ?", (user["sub"],)
            ).fetchone()[0]
            same_name = conn.execute(
                "SELECT 1 FROM portfolios WHERE user_id = ? AND name = ?", (user["sub"], req.name)
            ).fetchone()
        if not same_name:
            check_portfolio_count(user["sub"], existing_count)

        with _pf_db() as conn:
            conn.execute(
                """INSERT INTO portfolios (user_id, name, tickers, weights, capital, method, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(user_id, name) DO UPDATE SET
                       tickers=excluded.tickers, weights=excluded.weights,
                       capital=excluded.capital, method=excluded.method,
                       created_at=excluded.created_at""",
                (user["sub"], req.name, json.dumps(req.tickers), json.dumps(req.weights), req.capital, req.method),
            )
            conn.commit()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("DB write error (portfolios): %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save portfolio.")
    return {"status": "saved", "name": req.name}


@router.delete("/saved/{name}")
def delete_portfolio(name: str, user: dict = Depends(get_current_user)) -> Any:
    """Deletes saved portfolio owned by authenticated user."""
    try:
        with _pf_db() as conn:
            conn.execute("DELETE FROM portfolios WHERE name = ? AND user_id = ?", (name, user["sub"]))
            conn.commit()
    except Exception as exc:
        logger.error("DB write error (portfolios): %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete portfolio.")
    return {"status": "deleted", "name": name}


# ---------------------------------------------------------------------------
# Tracker portfolios — user-scoped server-side storage
# ---------------------------------------------------------------------------

@contextmanager
def _tracker_db():
    conn = sqlite3.connect(_TRACKER_DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


class SaveTrackerRequest(BaseModel):
    id: str
    name: str
    positions: list[dict]
    created_at: str | None = None


@router.get("/tracker")
def list_tracker_portfolios(user: dict = Depends(get_current_user)) -> Any:
    """Returns tracker portfolios for authenticated user."""
    with _tracker_db() as conn:
        rows = conn.execute(
            "SELECT id, name, data, created_at FROM tracker_portfolios WHERE user_id = ? ORDER BY created_at DESC",
            (user["sub"],),
        ).fetchall()
    return [
        {"id": r[0], "name": r[1], **json.loads(r[2]), "createdAt": r[3]}
        for r in rows
    ]


@router.post("/tracker")
def save_tracker_portfolio(req: SaveTrackerRequest, user: dict = Depends(get_current_user)) -> Any:
    """Upserts tracker portfolio for authenticated user."""
    from ..plan_gate import get_limits, get_plan_for_user
    plan = get_plan_for_user(user["sub"])
    limits = get_limits(plan)
    max_tracker = limits.get("tracker_portfolios")

    with _tracker_db() as conn:
        existing_count = conn.execute(
            "SELECT COUNT(*) FROM tracker_portfolios WHERE user_id = ?", (user["sub"],)
        ).fetchone()[0]
        same_id = conn.execute(
            "SELECT 1 FROM tracker_portfolios WHERE user_id = ? AND id = ?", (user["sub"], req.id)
        ).fetchone()

    if not same_id and max_tracker is not None and existing_count >= max_tracker:
        raise HTTPException(
            status_code=402,
            detail=f"Tracker portfolio limit ({max_tracker}) reached on plan '{plan}'. Upgrade to add more.",
        )

    data = json.dumps({"positions": req.positions})
    with _tracker_db() as conn:
        conn.execute(
            """INSERT INTO tracker_portfolios (id, user_id, name, data, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(user_id, name) DO UPDATE SET
                   data=excluded.data, id=excluded.id""",
            (req.id, user["sub"], req.name, data, req.created_at or ""),
        )
        conn.commit()
    return {"status": "saved", "id": req.id}


@router.delete("/tracker/{portfolio_id}")
def delete_tracker_portfolio(portfolio_id: str, user: dict = Depends(get_current_user)) -> Any:
    """Deletes tracker portfolio owned by authenticated user."""
    with _tracker_db() as conn:
        conn.execute(
            "DELETE FROM tracker_portfolios WHERE id = ? AND user_id = ?",
            (portfolio_id, user["sub"]),
        )
        conn.commit()
    return {"status": "deleted", "id": portfolio_id}


# ---------------------------------------------------------------------------
# POST /portfolio/performance
# ---------------------------------------------------------------------------
@router.post("/performance")
def portfolio_performance(req: PerformanceRequest) -> Any:
    """
    Tracks realized portfolio performance from start_date to today.
    Returns daily portfolio and benchmark (SPY) values plus realized metrics.
    Annualized ratios (Sharpe, Sortino, Calmar) only shown when >= 252 trading days.
    """
    import concurrent.futures

    tickers = _sanitize_tickers(req.tickers)
    if len(tickers) != len(req.weights):
        raise HTTPException(status_code=422, detail="tickers and weights length mismatch.")

    w_arr = np.array(req.weights, dtype=float)
    w_arr /= w_arr.sum()

    def _fetch(sym_or_list, start: str) -> pd.DataFrame:
        """Download via yfinance with 45s timeout. Always returns a DataFrame."""
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(
                yf.download,
                tickers=sym_or_list,
                start=start,
                progress=False,
                auto_adjust=True,
            )
            try:
                return fut.result(timeout=45)
            except concurrent.futures.TimeoutError:
                return pd.DataFrame()

    def _extract_close(raw: pd.DataFrame, syms: list[str]) -> pd.DataFrame:
        """Extract Close prices as a tidy DataFrame(index=date, cols=tickers)."""
        if raw.empty:
            return pd.DataFrame()
        if isinstance(raw.columns, pd.MultiIndex):
            # yfinance >= 0.2 multi-ticker: columns are (metric, ticker)
            closes = raw["Close"].copy()
        else:
            # Single-ticker download or older yfinance
            closes = raw[["Close"]].copy()
            closes.columns = syms[:1]
        if isinstance(closes, pd.Series):
            closes = closes.to_frame(name=syms[0])
        return closes

    def _to_series(obj) -> pd.Series:
        """Coerce DataFrame/Series to a Series (take first column if DataFrame)."""
        if isinstance(obj, pd.DataFrame):
            return obj.iloc[:, 0]
        return obj

    try:
        raw = _fetch(tickers, req.start_date)
        if raw is None or raw.empty:
            raise ValueError("No price data returned from yfinance.")

        closes = _extract_close(raw, tickers)
        closes = closes.dropna(how="all").ffill().dropna()
        if len(closes) < 2:
            raise ValueError("Insufficient data for the requested start_date.")

        available = [t for t in tickers if t in closes.columns]
        if not available:
            raise ValueError("None of the requested tickers have data from start_date.")
        w_aligned = pd.Series(dict(zip(tickers, w_arr))).reindex(available).fillna(0.0)
        w_aligned /= w_aligned.sum()
        closes = closes[available]

        rets = closes.pct_change().dropna()
        # dot product works for both DataFrame and Series
        port_rets: pd.Series = rets.dot(w_aligned)

        cum = (1 + port_rets).cumprod()
        dates = [closes.index[0].strftime("%Y-%m-%d")] + [d.strftime("%Y-%m-%d") for d in rets.index]
        portfolio_values = [round(float(req.capital), 2)] + [round(float(req.capital) * float(v), 2) for v in cum]

        # Benchmark SPY — download as string to avoid MultiIndex
        spy_rets: pd.Series = pd.Series(dtype=float)
        bench_values: list[float] = [float(req.capital)] * len(portfolio_values)
        try:
            raw_spy = _fetch("SPY", req.start_date)
            if raw_spy is not None and not raw_spy.empty:
                spy_close = _to_series(raw_spy["Close"] if "Close" in raw_spy.columns else raw_spy.iloc[:, 0])
                spy_close = _to_series(spy_close.reindex(closes.index).ffill().dropna())
                spy_rets = spy_close.pct_change().dropna()
                spy_cum = (1 + spy_rets).cumprod()
                bench_list = [round(float(req.capital), 2)] + [round(float(req.capital) * float(v), 2) for v in spy_cum]
                n = len(portfolio_values)
                bench_values = (bench_list + [bench_list[-1]] * n)[:n]
        except Exception:
            pass  # Benchmark failure is non-fatal

        n_days = len(port_rets)
        total_return = float(cum.iloc[-1] - 1)

        roll_max = cum.cummax()
        max_dd = float(((cum - roll_max) / roll_max).min())

        ann_return = 0.0
        ann_vol = 0.0
        metrics: dict[str, Any] = {
            "total_return": round(total_return, 4),
            "current_value": portfolio_values[-1],
            "max_drawdown": round(max_dd, 4),
        }

        if n_days >= 30:
            ann_factor = 252 / n_days
            ann_return = float((1 + total_return) ** ann_factor - 1)
            ann_vol = float(port_rets.std() * np.sqrt(252))
            metrics["ann_return"] = round(ann_return, 4)
            metrics["ann_volatility"] = round(ann_vol, 4)

            common_idx = port_rets.index.intersection(spy_rets.index)
            if len(common_idx) >= 30:
                p = port_rets.loc[common_idx].values
                m = spy_rets.loc[common_idx].values
                cov_pm = float(np.cov(p, m)[0, 1])
                var_m = float(np.var(m))
                metrics["beta"] = round(cov_pm / var_m if var_m > 0 else 0.0, 4)

        if n_days >= 252:
            sharpe = (ann_return - 0.04) / ann_vol if ann_vol > 0 else 0.0
            downside = port_rets[port_rets < 0].values
            dd_dev = float(np.std(downside) * np.sqrt(252)) if len(downside) > 5 else ann_vol
            sortino = (ann_return - 0.04) / dd_dev if dd_dev > 0 else 0.0
            calmar = ann_return / abs(max_dd) if max_dd < 0 else 0.0
            metrics["sharpe_ratio"] = round(sharpe, 4)
            metrics["sortino_ratio"] = round(sortino, 4)
            metrics["calmar_ratio"] = round(calmar, 4)

        return {
            "dates": dates,
            "portfolio_values": portfolio_values,
            "benchmark_values": bench_values,
            "n_days": n_days,
            "metrics": metrics,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Performance tracking error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"Performance tracking failed: {exc}")


# ---------------------------------------------------------------------------
# POST /portfolio/tracker-performance
# ---------------------------------------------------------------------------
class TrackerPosition(BaseModel):
    ticker:      str   = Field(..., min_length=1, max_length=12)
    shares:      float = Field(..., gt=0)
    entry_price: float = Field(..., gt=0)
    entry_date:  str   # YYYY-MM-DD


class TrackerPerfRequest(BaseModel):
    positions: list[TrackerPosition] = Field(..., min_length=1, max_length=100)


@router.post("/tracker-performance")
def tracker_portfolio_performance(req: TrackerPerfRequest) -> Any:
    """
    Computes daily portfolio value from raw tracker positions.
    Returns: dates, portfolio_values (absolute €), cost_basis, per-position metrics.
    Handles positions entering at different dates — each position contributes
    to daily value only from its entry_date onwards.
    """
    import concurrent.futures

    raw_tickers = list({p.ticker.upper().strip() for p in req.positions})
    start_date  = min(p.entry_date for p in req.positions)

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(
            yf.download,
            tickers=raw_tickers,
            start=start_date,
            progress=False,
            auto_adjust=True,
        )
        try:
            raw = fut.result(timeout=45)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Market data timeout.")

    if raw is None or raw.empty:
        raise HTTPException(status_code=503, detail="No market data returned.")

    # Extract Close prices
    if isinstance(raw.columns, pd.MultiIndex):
        closes = raw["Close"].copy()
    else:
        closes = raw[["Close"]].copy()
        closes.columns = raw_tickers[:1]

    if isinstance(closes, pd.Series):
        closes = closes.to_frame(name=raw_tickers[0])

    closes = closes.sort_index().ffill()

    # Normalise ticker case for positions
    positions = [TrackerPosition(
        ticker=p.ticker.upper().strip(),
        shares=p.shares,
        entry_price=p.entry_price,
        entry_date=p.entry_date,
    ) for p in req.positions]

    # Build daily portfolio value + cost basis
    portfolio_vals: list[float] = []
    cost_basis_vals: list[float] = []

    for date in closes.index:
        date_str = date.strftime("%Y-%m-%d")
        day_val  = 0.0
        day_cost = 0.0
        for p in positions:
            if p.entry_date > date_str:
                continue
            col = p.ticker if p.ticker in closes.columns else None
            if col is None:
                continue
            price = closes.at[date, col]
            if pd.isna(price):
                continue
            day_val  += p.shares * float(price)
            day_cost += p.shares * p.entry_price
        portfolio_vals.append(day_val)
        cost_basis_vals.append(day_cost)

    vals_arr  = np.array(portfolio_vals,  dtype=float)
    costs_arr = np.array(cost_basis_vals, dtype=float)

    # Trim leading zeros (before any position entered)
    nonzero = np.where(vals_arr > 0)[0]
    if len(nonzero) == 0:
        raise HTTPException(status_code=422, detail="No valid position data for requested tickers.")

    s = int(nonzero[0])
    dates_out  = [d.strftime("%Y-%m-%d") for d in closes.index[s:]]
    vals_out   = vals_arr[s:].tolist()
    costs_out  = costs_arr[s:].tolist()

    # Aggregate metrics
    current_value  = vals_out[-1]  if vals_out  else 0.0
    current_cost   = costs_out[-1] if costs_out else 0.0
    unrealized_pnl = current_value - current_cost
    total_return   = unrealized_pnl / current_cost if current_cost > 0 else 0.0

    peak  = np.maximum.accumulate(np.array(vals_out))
    dd    = (np.array(vals_out) - peak) / peak
    max_dd = float(dd.min()) if len(dd) > 0 else 0.0

    # Per-position current snapshot
    pos_metrics = []
    for p in positions:
        col   = p.ticker if p.ticker in closes.columns else None
        cur_p = float(closes[col].dropna().iloc[-1]) if col and not closes[col].dropna().empty else None
        pos_val  = p.shares * cur_p if cur_p is not None else None
        pos_cost = p.shares * p.entry_price
        pos_pnl  = (pos_val - pos_cost) if pos_val is not None else None
        pos_ret  = (pos_pnl / pos_cost)  if pos_pnl is not None and pos_cost > 0 else None
        pos_metrics.append({
            "ticker":         p.ticker,
            "shares":         p.shares,
            "entry_price":    p.entry_price,
            "entry_date":     p.entry_date,
            "current_price":  cur_p,
            "current_value":  pos_val,
            "cost_basis":     pos_cost,
            "unrealized_pnl": pos_pnl,
            "return_pct":     round(pos_ret, 4) if pos_ret is not None else None,
        })

    return {
        "dates":            dates_out,
        "portfolio_values": vals_out,
        "cost_basis":       costs_out,
        "n_days":           len(dates_out),
        "metrics": {
            "current_value":   round(current_value,  2),
            "cost_basis":      round(current_cost,   2),
            "unrealized_pnl":  round(unrealized_pnl, 2),
            "total_return":    round(total_return,   4),
            "max_drawdown":    round(max_dd,          4),
        },
        "positions": pos_metrics,
    }