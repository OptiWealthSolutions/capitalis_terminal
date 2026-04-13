"""
Equity overview router.
Endpoints: price history, fundamentals, technical indicators, peer comparison.
"""

import re
import sys
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ..cache.memory_cache import cache, EQUITY_TTL

logger = logging.getLogger(__name__)
router = APIRouter()

_TICKER_RE = re.compile(r"^[A-Z0-9.\-\^=]{1,12}$")


def _assert_valid_ticker(ticker: str) -> str:
    t = ticker.strip().upper()
    if not _TICKER_RE.match(t):
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {ticker!r}")
    return t


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/history
# ---------------------------------------------------------------------------
@router.get("/{ticker}/history")
def get_price_history(
    ticker: str,
    period: str = Query(default="1y", pattern=r"^(1mo|3mo|6mo|1y|2y|5y|10y)$"),
    interval: str = Query(default="1d", pattern=r"^(1d|1wk|1mo)$"),
) -> Any:
    """OHLCV price history with SMA-50 and SMA-200."""
    t = _assert_valid_ticker(ticker)
    key = f"equity_hist_{t}_{period}_{interval}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        df = yf.download(t, period=period, interval=interval, progress=False, auto_adjust=True)
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for ticker {t!r}.")

        close = df["Close"]
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]

        df["SMA_50"] = close.rolling(window=50).mean()
        df["SMA_200"] = close.rolling(window=200).mean()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("yfinance history error for %s: %s", t, exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Market data unavailable.")

    result = {
        "ticker": t,
        "period": period,
        "interval": interval,
        "dates": df.index.strftime("%Y-%m-%d").tolist(),
        "open": df["Open"].round(4).tolist(),
        "high": df["High"].round(4).tolist(),
        "low": df["Low"].round(4).tolist(),
        "close": df["Close"].round(4).tolist(),
        "volume": df["Volume"].tolist(),
        "sma_50": df["SMA_50"].round(4).tolist(),
        "sma_200": df["SMA_200"].round(4).tolist(),
    }
    cache.set(key, result, ttl=EQUITY_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/fundamentals
# ---------------------------------------------------------------------------
@router.get("/{ticker}/fundamentals")
def get_fundamentals(ticker: str) -> Any:
    """yfinance fast_info + .info fundamental data."""
    t = _assert_valid_ticker(ticker)
    key = f"equity_fund_{t}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        tkr = yf.Ticker(t)
        info: dict = tkr.info or {}
    except Exception as exc:
        logger.error("yfinance fundamentals error for %s: %s", t, exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Fundamentals unavailable.")

    if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
        raise HTTPException(status_code=404, detail=f"No fundamental data found for {t!r}.")

    selected_fields = [
        "longName", "sector", "industry", "country", "currency",
        "currentPrice", "previousClose", "regularMarketOpen",
        "dayLow", "dayHigh", "fiftyTwoWeekLow", "fiftyTwoWeekHigh",
        "marketCap", "enterpriseValue", "forwardPE", "trailingPE",
        "priceToBook", "returnOnEquity", "returnOnAssets",
        "grossMargins", "operatingMargins", "profitMargins",
        "earningsGrowth", "revenueGrowth", "dividendYield",
        "debtToEquity", "currentRatio", "quickRatio",
        "totalRevenue", "netIncomeToCommon", "freeCashflow",
        "sharesOutstanding", "bookValue", "beta",
        "shortPercentOfFloat", "heldPercentInsiders",
    ]
    result = {k: info.get(k) for k in selected_fields}
    result["ticker"] = t
    cache.set(key, result, ttl=EQUITY_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/returns-stats
# ---------------------------------------------------------------------------
@router.get("/{ticker}/returns-stats")
def get_returns_stats(ticker: str) -> Any:
    """Annualized return, volatility, Sharpe, max drawdown, CAGR."""
    t = _assert_valid_ticker(ticker)
    key = f"equity_stats_{t}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        df = yf.download(t, period="5y", interval="1d", progress=False, auto_adjust=True)
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No price data for {t!r}.")
        close = df["Close"]
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Market data unavailable.")

    log_rets = np.log(close / close.shift(1)).dropna()
    ann_ret = float(log_rets.mean() * 252)
    ann_vol = float(log_rets.std() * np.sqrt(252))
    sharpe = (ann_ret - 0.04) / ann_vol if ann_vol > 0 else 0.0

    # Max drawdown
    cum = (1 + log_rets).cumprod()
    rolling_max = cum.cummax()
    drawdown = (cum - rolling_max) / rolling_max
    max_dd = float(drawdown.min())

    # CAGR
    n_years = len(close) / 252
    cagr = float((close.iloc[-1] / close.iloc[0]) ** (1 / n_years) - 1) if n_years > 0 else 0.0

    result = {
        "ticker": t,
        "ann_return": round(ann_ret, 4),
        "ann_volatility": round(ann_vol, 4),
        "sharpe_ratio": round(sharpe, 4),
        "max_drawdown": round(max_dd, 4),
        "cagr": round(cagr, 4),
    }
    cache.set(key, result, ttl=EQUITY_TTL)
    return result
