"""
Macro-Economic router.
Endpoints: global indicators (FRED), market data, regime (GMM),
           GARCH volatility, COT positioning, Alpha Vantage news.
"""

import os
import sys
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query, Request
from sklearn.mixture import GaussianMixture

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.macro_models.global_macro import fetch_global_macro_indicators
from src.macro_models.cot_scraper import fetch_and_save_cot_data
from src.utils.alpha_vantage import fetch_macro_news
from ..cache.memory_cache import (
    cache,
    MACRO_TTL,
    MARKET_DATA_TTL,
    GARCH_TTL,
    INDICATORS_TTL,
    NEWS_TTL,
)

try:
    from src.pf_engine.risk_management.volatility_engine import GARCHModeler
    _GARCH_AVAILABLE = True
except ImportError:
    _GARCH_AVAILABLE = False
    logging.warning("arch package not installed — GARCH endpoint disabled.")

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_GARCH_TICKERS = frozenset({"^GSPC", "^NDX", "GC=F", "CL=F", "BTC-USD"})


# ---------------------------------------------------------------------------
# /macro/indicators
# ---------------------------------------------------------------------------
@router.get("/indicators")
def get_macro_indicators() -> Any:
    """FRED global macro indicators: US / EU / JP rates, GDP, unemployment."""
    key = "macro_indicators"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        data = fetch_global_macro_indicators()
    except Exception as exc:
        logger.error("FRED API failure: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="FRED API unavailable.")

    cache.set(key, data, ttl=INDICATORS_TTL)
    return data


# ---------------------------------------------------------------------------
# /macro/market-data
# ---------------------------------------------------------------------------
@router.get("/market-data")
def get_market_data() -> Any:
    """5-year daily OHLCV for S&P500, VIX, 10Y/3M yields, Gold, Oil."""
    key = "macro_market_data"
    cached = cache.get(key)
    if cached is not None:
        return cached

    tickers = {
        "SP500": "^GSPC",
        "VIX": "^VIX",
        "US10Y": "^TNX",
        "US3M": "^IRX",
        "GOLD": "GC=F",
        "OIL": "CL=F",
    }
    try:
        raw = yf.download(
            list(tickers.values()),
            period="5y",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        close: pd.DataFrame = raw["Close"].copy()
        inv_map = {v: k for k, v in tickers.items()}
        close.columns = [inv_map.get(str(c), str(c)) for c in close.columns]
        if {"US10Y", "US3M"}.issubset(close.columns):
            close["YIELD_SPREAD"] = close["US10Y"] - close["US3M"]
        close = close.dropna(how="all")
    except Exception as exc:
        logger.error("yfinance market-data failure: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Market data feed unavailable.")

    result = {
        "dates": close.index.strftime("%Y-%m-%d").tolist(),
        "data": {col: close[col].round(4).tolist() for col in close.columns},
    }
    cache.set(key, result, ttl=MARKET_DATA_TTL)
    return result


# ---------------------------------------------------------------------------
# /macro/regime
# ---------------------------------------------------------------------------
@router.get("/regime")
def get_market_regime() -> Any:
    """
    Gaussian Mixture Model (2-state) on S&P 500 log-returns + VIX.
    Returns regime labels, Bull/Bear probabilities, and latest state.
    """
    key = "macro_regime"
    cached = cache.get(key)
    if cached is not None:
        return cached

    market = get_market_data()
    sp500 = np.array(market["data"]["SP500"], dtype=float)
    vix = np.array(market["data"]["VIX"], dtype=float)
    dates = market["dates"]

    # Log-returns — align with VIX (T+1 to T+n)
    returns = np.diff(np.log(np.where(sp500 > 0, sp500, np.nan))) * 100
    vix_aligned = vix[1:]
    dates_aligned = dates[1:]

    valid_mask = np.isfinite(returns) & np.isfinite(vix_aligned)
    X = np.column_stack([returns[valid_mask], vix_aligned[valid_mask]])

    gmm = GaussianMixture(
        n_components=2, covariance_type="full", random_state=42, n_init=5
    ).fit(X)

    regimes_full = np.zeros(len(returns), dtype=int)
    probs_full = np.zeros((len(returns), 2), dtype=float)
    regimes_full[valid_mask] = gmm.predict(X)
    probs_full[valid_mask] = gmm.predict_proba(X)

    # Convention: regime 0 = Bull/Low-Vol (lower mean VIX component)
    if gmm.means_[0, 1] > gmm.means_[1, 1]:
        regimes_full = 1 - regimes_full
        probs_full = probs_full[:, ::-1]

    result = {
        "dates": dates_aligned,
        "sp500": sp500[1:].round(4).tolist(),
        "regimes": regimes_full.tolist(),
        "prob_bull": probs_full[:, 0].round(4).tolist(),
        "prob_bear": probs_full[:, 1].round(4).tolist(),
        "current_regime": int(regimes_full[-1]),
        "current_regime_label": "BEAR / HIGH VOL" if regimes_full[-1] == 1 else "BULL / LOW VOL",
        "current_prob_bull": round(float(probs_full[-1, 0]), 4),
    }
    cache.set(key, result, ttl=MACRO_TTL)
    return result


# ---------------------------------------------------------------------------
# /macro/garch/{ticker}
# ---------------------------------------------------------------------------
@router.get("/garch/{ticker}")
def get_garch_forecast(ticker: str) -> Any:
    """GARCH(1,1) conditional volatility and T+1 forecast."""
    if not _GARCH_AVAILABLE:
        raise HTTPException(status_code=503, detail="arch package not installed on this server.")

    if ticker not in _ALLOWED_GARCH_TICKERS:
        raise HTTPException(
            status_code=400,
            detail=f"Ticker '{ticker}' not in allowed GARCH universe: {sorted(_ALLOWED_GARCH_TICKERS)}",
        )

    key = f"garch_{ticker}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        modeler = GARCHModeler()
        rets = modeler.fetch_and_prepare_data(ticker)
        cond_vol, forecast_vol = modeler.fit_garch(rets)
        realized_30d = float(rets.tail(30).std() * np.sqrt(252)) if len(rets) >= 30 else 0.0
    except Exception as exc:
        logger.error("GARCH computation error for %s: %s", ticker, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="GARCH computation failed.")

    result = {
        "ticker": ticker,
        "realized_vol_30d": round(realized_30d, 4),
        "conditional_vol_current": round(float(cond_vol.iloc[-1]), 4),
        "forecast_t1": round(float(forecast_vol), 4),
        "dates": cond_vol.index.strftime("%Y-%m-%d").tolist(),
        "conditional_vol_series": cond_vol.round(4).tolist(),
        "abs_returns_dates": rets.index.strftime("%Y-%m-%d").tolist(),
        "abs_returns_series": rets.abs().round(4).tolist(),
    }
    cache.set(key, result, ttl=GARCH_TTL)
    return result


# ---------------------------------------------------------------------------
# /macro/cot
# ---------------------------------------------------------------------------
@router.get("/cot")
def get_cot_data() -> Any:
    """Latest CFTC COT positioning for major asset classes."""
    cot_path = ROOT / "data" / "cot_latest.csv"
    if not cot_path.exists():
        raise HTTPException(
            status_code=404,
            detail="COT data file not found. POST /macro/cot/sync to fetch it.",
        )
    try:
        df = pd.read_csv(cot_path)
    except Exception as exc:
        logger.error("COT CSV read error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to parse COT data file.")
    return df.to_dict(orient="records")


@router.post("/cot/sync")
def sync_cot_data() -> Any:
    """Triggers CFTC COT web scraping. Rate-limited — do not call more than once per hour."""
    try:
        success = fetch_and_save_cot_data()
    except Exception as exc:
        logger.error("COT scraping error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="COT scraping raised an exception.")

    if not success:
        raise HTTPException(status_code=503, detail="COT source unavailable or returned no data.")

    return {"status": "success", "message": "COT data synchronized."}


# ---------------------------------------------------------------------------
# /macro/news
# ---------------------------------------------------------------------------
@router.get("/news")
def get_macro_news(limit: int = Query(default=15, ge=1, le=50)) -> Any:
    """Alpha Vantage macro news with sentiment scores."""
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ALPHA_VANTAGE_API_KEY not configured.")

    key = f"macro_news_{limit}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        articles = fetch_macro_news(api_key=api_key, limit=limit) or []
    except Exception as exc:
        logger.error("Alpha Vantage news error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="News feed unavailable.")

    cache.set(key, articles, ttl=NEWS_TTL)
    return articles
