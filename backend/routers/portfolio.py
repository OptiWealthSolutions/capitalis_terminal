"""
Portfolio optimization and risk management router.
Endpoints: optimize, monte-carlo, stress-test, portfolio CRUD.
"""

import sys
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.pf_engine.portfolio_optimization.portfolio_optimizer import Portfolio
from src.pf_engine.portfolio_optimization.hrp_engine import post_process_weights
from src.pf_engine.risk_management.monte_carlo_simulation import (
    run_monte_carlo_portfolio,
    calculate_var_cvar,
)
from src.data_managers.db_manager import get_db
from ..schemas.portfolio import OptimizationRequest, MonteCarloRequest
from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()

_YFINANCE_TICKER_MAP = {
    "BRK.B": "BRK-B",
    "BRK.A": "BRK-A",
    "BF.B": "BF-B",
}


def _sanitize_tickers(tickers: list[str]) -> list[str]:
    return [_YFINANCE_TICKER_MAP.get(t, t) for t in tickers]


# ---------------------------------------------------------------------------
# POST /portfolio/optimize
# ---------------------------------------------------------------------------
@router.post("/optimize")
def optimize_portfolio(req: OptimizationRequest) -> Any:
    """
    Runs portfolio optimization (HRP, Markowitz, Max Sharpe, Min Vol, Risk Parity).
    Returns weights, allocation in base currency, and key risk metrics.
    """
    tickers = _sanitize_tickers(req.tickers)
    cache_key = f"pf_opt_{'-'.join(sorted(tickers))}_{req.method}_{req.capital}_{req.min_weight}_{req.max_weight}_{req.risk_aversion}"
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
        )
        weights = portfolio.Optimize(method=req.method)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Portfolio optimization error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Optimization engine failed.")

    if weights is None or len(weights) == 0:
        raise HTTPException(status_code=422, detail="Optimizer returned empty weights. Check ticker validity.")

    processed = post_process_weights(
        weights,
        portfolio.returns,
        min_weight=req.min_weight,
        max_weight=req.max_weight,
    )

    allocation = {t: round(w * req.capital, 2) for t, w in zip(tickers, processed)}
    weights_dict = {t: round(w, 6) for t, w in zip(tickers, processed)}

    # Portfolio-level metrics
    w_arr = np.array(processed)
    mu_vec = portfolio.mu.values
    cov = portfolio.returns.cov().values * 252
    port_ret = float(np.dot(w_arr, mu_vec))
    port_vol = float(np.sqrt(w_arr @ cov @ w_arr))
    sharpe = (port_ret - 0.04) / port_vol if port_vol > 0 else 0.0

    result = {
        "method": req.method,
        "tickers": tickers,
        "weights": weights_dict,
        "allocation_eur": allocation,
        "metrics": {
            "expected_annual_return": round(port_ret, 4),
            "annual_volatility": round(port_vol, 4),
            "sharpe_ratio": round(sharpe, 4),
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
        raw = yf.download(tickers, period="10y", interval="1d", progress=False, auto_adjust=True)
        close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        returns = np.log(close / close.shift(1)).dropna()
        mu_vec = returns.mean().values * 252
        cov_matrix = returns.cov().values * 252
    except Exception as exc:
        logger.error("Data fetch for Monte Carlo failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Market data unavailable for Monte Carlo.")

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
    var_95, cvar_95 = calculate_var_cvar(final_vals, initial_capital=req.capital)

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
# GET /portfolio/saved
# POST /portfolio/save
# DELETE /portfolio/saved/{name}
# ---------------------------------------------------------------------------
@router.get("/saved")
def list_saved_portfolios() -> Any:
    """Returns list of all saved portfolios from SQLite."""
    try:
        with get_db() as conn:
            df = pd.read_sql("SELECT name, tickers, weights, capital, created_at FROM portfolios ORDER BY created_at DESC", conn)
        return df.to_dict(orient="records")
    except Exception as exc:
        logger.error("DB read error (portfolios): %s", exc)
        raise HTTPException(status_code=500, detail="Database read failed.")


@router.post("/save")
def save_portfolio(name: str, tickers: list[str], weights: list[float], capital: float) -> Any:
    """Persists a portfolio to SQLite."""
    import json
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO portfolios (name, tickers, weights, capital, created_at)
                   VALUES (?, ?, ?, ?, datetime('now'))""",
                (name, json.dumps(tickers), json.dumps(weights), capital),
            )
            conn.commit()
    except Exception as exc:
        logger.error("DB write error (portfolios): %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save portfolio.")
    return {"status": "saved", "name": name}


@router.delete("/saved/{name}")
def delete_portfolio(name: str) -> Any:
    """Deletes a saved portfolio by name."""
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM portfolios WHERE name = ?", (name,))
            conn.commit()
    except Exception as exc:
        logger.error("DB delete error (portfolios): %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete portfolio.")
    return {"status": "deleted", "name": name}
