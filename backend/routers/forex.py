"""
FOREX router.
Endpoints: watchlist, FX indices (base-100), yield curves, correlations, retail sentiment.
"""

import os
import logging
import concurrent.futures
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
import requests
from fastapi import APIRouter, HTTPException

from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()

FOREX_TTL = 3600

_WATCHLIST: dict[str, str] = {
    "EUR/USD": "EURUSD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "USDJPY=X",
    "USD/CHF": "USDCHF=X",
    "AUD/USD": "AUDUSD=X",
    "USD/CAD": "USDCAD=X",
    "NZD/USD": "NZDUSD=X",
    "EUR/GBP": "EURGBP=X",
    "EUR/JPY": "EURJPY=X",
    "GBP/JPY": "GBPJPY=X",
    "USD/CNY": "USDCNY=X",
    "DXY":     "DX-Y.NYB",
}

_FX_INDICES: dict[str, str] = {
    "DXY":     "DX-Y.NYB",
    "EUR/USD": "EURUSD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "USDJPY=X",
    "USD/CHF": "USDCHF=X",
    "AUD/USD": "AUDUSD=X",
    "USD/CAD": "USDCAD=X",
    "NZD/USD": "NZDUSD=X",
}

_CORR_TICKERS: dict[str, str] = {
    "EUR/USD":   "EURUSD=X",
    "GBP/USD":   "GBPUSD=X",
    "USD/JPY":   "USDJPY=X",
    "USD/CHF":   "USDCHF=X",
    "AUD/USD":   "AUDUSD=X",
    "USD/CAD":   "USDCAD=X",
    "Gold":      "GC=F",
    "Oil (WTI)": "CL=F",
    "Silver":    "SI=F",
    "BTC":       "BTC-USD",
}

_US_YIELD_SERIES: dict[str, str] = {
    "1M":  "DGS1MO",
    "3M":  "DGS3MO",
    "6M":  "DGS6MO",
    "1Y":  "DGS1",
    "2Y":  "DGS2",
    "5Y":  "DGS5",
    "7Y":  "DGS7",
    "10Y": "DGS10",
    "20Y": "DGS20",
    "30Y": "DGS30",
}

_EU_YIELD_SERIES: dict[str, str] = {
    "3M":  "IR3TIB01EZM156N",
    "10Y": "IRLTLT01EZM156N",
}

_JP_YIELD_SERIES: dict[str, str] = {
    "3M":  "IR3TIB01JPM156N",
    "10Y": "IRLTLT01JPM156N",
}


def _safe_float(v: Any) -> float | None:
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _download_closes(ticker_map: dict[str, str], period: str = "1y") -> pd.DataFrame:
    """Download closes for a label->ticker map via parallel Ticker.history() calls."""
    def _fetch(item: tuple) -> tuple:
        label, sym = item
        try:
            s = yf.Ticker(sym).history(period=period, interval="1d")["Close"].dropna()
            s.name = label
            return label, s
        except Exception as exc:
            logger.warning("yfinance fetch failed for %s (%s): %s", label, sym, exc)
            return label, pd.Series(dtype=float, name=label)

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        fetched = dict(ex.map(_fetch, ticker_map.items()))

    return pd.DataFrame(fetched).sort_index()


# ---------------------------------------------------------------------------
# /forex/watchlist
# ---------------------------------------------------------------------------
@router.get("/watchlist")
def get_watchlist() -> Any:
    """Current price + 1D change for all major FX pairs."""
    key = "forex_watchlist"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        closes = _download_closes(_WATCHLIST, period="5d")
    except Exception as exc:
        logger.error("watchlist yfinance: %s", exc)
        raise HTTPException(status_code=502, detail="FX watchlist unavailable.")

    result = []
    for label in _WATCHLIST:
        if label not in closes.columns:
            continue
        s = closes[label].dropna()
        if len(s) < 2:
            continue
        price = _safe_float(s.iloc[-1])
        prev  = _safe_float(s.iloc[-2])
        if price is None or prev is None or prev == 0:
            continue
        change_abs = round(price - prev, 6)
        change_pct = round((price - prev) / prev * 100, 4)
        result.append({
            "pair":       label,
            "price":      round(price, 5),
            "change_abs": change_abs,
            "change_pct": change_pct,
        })

    cache.set(key, result, 300)  # 5-min TTL for watchlist
    return result


# ---------------------------------------------------------------------------
# /forex/indices
# ---------------------------------------------------------------------------
@router.get("/indices")
def get_fx_indices() -> Any:
    """FX pairs + DXY normalized to base 100 (1-year daily)."""
    key = "forex_indices"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        closes = _download_closes(_FX_INDICES, period="1y")
    except Exception as exc:
        logger.error("FX indices yfinance: %s", exc)
        raise HTTPException(status_code=502, detail="FX indices unavailable.")

    available = {col: closes[col].dropna() for col in closes.columns if len(closes[col].dropna()) > 1}
    if not available:
        raise HTTPException(status_code=502, detail="No FX data returned.")

    # On combine les séries en remplissant les jours fériés pour ne pas perdre de données
    combined = pd.DataFrame(available).ffill().bfill()
    if combined.empty:
        raise HTTPException(status_code=502, detail="FX data mismatch, no common dates found.")
    
    normalized = (combined / combined.iloc[0]) * 100

    result: dict[str, Any] = {
        "dates": [d.strftime("%Y-%m-%d") for d in normalized.index],
        "series": {
            col: [_safe_float(v) for v in normalized[col].tolist()]
            for col in normalized.columns
        },
    }

    cache.set(key, result, FOREX_TTL)
    return result


# ---------------------------------------------------------------------------
# /forex/yield_curves
# ---------------------------------------------------------------------------
@router.get("/yield_curves")
def get_yield_curves() -> Any:
    """US/EU/JP yield curve snapshots + historical 10Y (FRED)."""
    key = "forex_yield_curves"
    cached = cache.get(key)
    if cached is not None:
        return cached

    fred_key = os.environ.get("FRED_API_KEY", "")
    if not fred_key:
        raise HTTPException(status_code=503, detail="FRED_API_KEY not configured.")

    try:
        from fredapi import Fred
        fred = Fred(api_key=fred_key)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"FRED init failed: {exc}")

    def _fetch_zone(series_map: dict[str, str]) -> dict[str, Any]:
        maturities: list[str] = []
        rates: list[float | None] = []
        hist_10y: dict[str, list] = {"dates": [], "values": []}
        for mat, sid in series_map.items():
            try:
                s = fred.get_series(sid, observation_start="2000-01-01").dropna()
                rates.append(_safe_float(s.iloc[-1]))
                maturities.append(mat)
                if mat == "10Y":
                    hist_10y = {
                        "dates":  [d.strftime("%Y-%m-%d") for d in s.index],
                        "values": [_safe_float(v) for v in s.tolist()],
                    }
            except Exception:
                rates.append(None)
                maturities.append(mat)
        return {"maturities": maturities, "rates": rates, "history_10y": hist_10y}

    result = {
        "US": _fetch_zone(_US_YIELD_SERIES),
        "EU": _fetch_zone(_EU_YIELD_SERIES),
        "JP": _fetch_zone(_JP_YIELD_SERIES),
    }

    cache.set(key, result, FOREX_TTL)
    return result


# ---------------------------------------------------------------------------
# /forex/correlations
# ---------------------------------------------------------------------------
@router.get("/correlations")
def get_fx_correlations() -> Any:
    """Pearson correlation matrix — FX pairs + commodities (1Y daily log-returns)."""
    key = "forex_correlations"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        closes = _download_closes(_CORR_TICKERS, period="1y")
    except Exception as exc:
        logger.error("correlation yfinance: %s", exc)
        raise HTTPException(status_code=502, detail="Correlation data unavailable.")

    # Remplissage des données manquantes et calcul des rendements logarithmiques
    closes_filled = closes.ffill().bfill()
    log_returns = np.log(closes_filled / closes_filled.shift(1)).dropna(how="all")

    available = [c for c in _CORR_TICKERS if c in log_returns.columns]
    corr = log_returns[available].corr(method="pearson").round(3).fillna(0)

    result: dict[str, Any] = {
        "labels": available,
        "matrix": corr.values.tolist(),
    }

    cache.set(key, result, FOREX_TTL)
    return result


# ---------------------------------------------------------------------------
# /forex/retail_sentiment
# ---------------------------------------------------------------------------
@router.get("/retail_sentiment")
def get_retail_sentiment() -> Any:
    """
    Retail positioning from myfxbook Community Outlook API.
    Requires MYFXBOOK_EMAIL + MYFXBOOK_PASSWORD env vars.
    """
    key = "forex_retail_sentiment"
    cached = cache.get(key)
    if cached is not None:
        return cached

    email    = os.environ.get("MYFXBOOK_EMAIL", "")
    password = os.environ.get("MYFXBOOK_PASSWORD", "")

    if not email or not password:
        return {"configured": False, "data": []}

    try:
        login = requests.get(
            "https://www.myfxbook.com/api/login.json",
            params={"email": email, "password": password},
            timeout=10,
        ).json()

        if login.get("error"):
            logger.warning("myfxbook login: %s", login.get("message"))
            return {"configured": True, "data": [], "error": login.get("message")}

        session = login["session"]
        outlook = requests.get(
            "https://www.myfxbook.com/api/get-community-outlook.json",
            params={"session": session},
            timeout=10,
        ).json()

        if outlook.get("error"):
            return {"configured": True, "data": [], "error": outlook.get("message")}

        symbols = outlook.get("symbols", {}).get("symbol", [])
        if isinstance(symbols, dict):
            symbols = [symbols]

        data = [
            {
                "symbol":       s.get("name"),
                "long_pct":     _safe_float(s.get("longPercentage")),
                "short_pct":    _safe_float(s.get("shortPercentage")),
                "long_volume":  _safe_float(s.get("longVolume")),
                "short_volume": _safe_float(s.get("shortVolume")),
            }
            for s in symbols
            if s.get("name")
        ]

        result: dict[str, Any] = {"configured": True, "data": data}
        cache.set(key, result, FOREX_TTL)
        return result

    except Exception as exc:
        logger.error("myfxbook: %s", exc)
        return {"configured": True, "data": [], "error": str(exc)}
