"""
yf_safe — resilient wrappers around yfinance with timeout, retry, and cache fallback.

Drop-in replacements for raw yf.download / yf.Ticker().info calls.
Never raises on yfinance network failures — returns empty DataFrame / {} instead.

Usage:
    from backend.yf_safe import safe_download, safe_ticker_info

    df   = safe_download("AAPL", period="1y")       # always a DataFrame (may be empty)
    info = safe_ticker_info("AAPL")                  # always a dict (may be {})
"""

import concurrent.futures
import logging
import time
from typing import Any

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

import requests

_DEFAULT_TIMEOUT = 30   # seconds per yfinance call
_MAX_RETRIES     = 2
_RETRY_DELAY     = 1.5  # seconds between retries

# Global session with browser-like headers to avoid "Invalid Crumb" / 401 errors
_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
})


def _run_with_timeout(fn, *args, timeout: float = _DEFAULT_TIMEOUT, **kwargs):
    """Execute fn(*args, **kwargs) in a thread with a hard timeout."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(fn, *args, **kwargs)
        try:
            return fut.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            logger.warning("yf_safe: timeout after %.0fs — %s %s", timeout, fn.__name__, args[:1])
            return None
        except Exception as exc:
            raise exc  # let caller handle non-timeout errors


def safe_download(
    tickers,
    period: str = "1y",
    interval: str = "1d",
    timeout: float = _DEFAULT_TIMEOUT,
    retries: int = _MAX_RETRIES,
    **kwargs,
) -> pd.DataFrame:
    """
    Wraps yf.download with timeout + retry.
    Returns empty DataFrame on any failure — never raises.
    """
    for attempt in range(retries + 1):
        try:
            result = _run_with_timeout(
                yf.download,
                tickers=tickers,
                period=period,
                interval=interval,
                progress=False,
                auto_adjust=True,
                timeout=timeout,
                session=_SESSION,
                **kwargs,
            )
            if result is None:
                # timeout — fall through to retry
                pass
            elif isinstance(result, pd.DataFrame) and not result.empty:
                return result
            else:
                logger.warning("yf_safe.safe_download: empty result for %s", tickers)
                return pd.DataFrame()
        except Exception as exc:
            logger.warning("yf_safe.safe_download attempt %d/%d error for %s: %s",
                           attempt + 1, retries + 1, tickers, exc)

        if attempt < retries:
            time.sleep(_RETRY_DELAY * (attempt + 1))

    logger.error("yf_safe.safe_download: all %d attempts failed for %s", retries + 1, tickers)
    return pd.DataFrame()


def safe_ticker_info(
    ticker: str,
    timeout: float = _DEFAULT_TIMEOUT,
    retries: int = _MAX_RETRIES,
    cache_fallback: bool = True,
) -> dict[str, Any]:
    """
    Wraps yf.Ticker(ticker).info with timeout + retry + SQLite cache fallback.
    Returns empty dict on total failure — never raises.
    """
    from backend.equity_cache import read_stale, write  # lazy to avoid circular imports

    for attempt in range(retries + 1):
        try:
            result = _run_with_timeout(
                lambda t=ticker: yf.Ticker(t, session=_SESSION).info,
                timeout=timeout,
            )
            if result and isinstance(result, dict) and result.get("symbol"):
                if cache_fallback:
                    try:
                        write(ticker, "info", result)
                    except Exception:
                        pass
                return result
        except Exception as exc:
            logger.warning("yf_safe.safe_ticker_info attempt %d/%d for %s: %s",
                           attempt + 1, retries + 1, ticker, exc)

        if attempt < retries:
            time.sleep(_RETRY_DELAY * (attempt + 1))

    # All attempts failed — try stale cache
    if cache_fallback:
        stale = read_stale(ticker, "info")
        if stale:
            logger.info("yf_safe: serving stale cache for %s info", ticker)
            return stale

    logger.error("yf_safe.safe_ticker_info: all attempts failed for %s", ticker)
    return {}


def safe_ticker_fast_info(
    ticker: str,
    timeout: float = 15,
) -> dict[str, Any]:
    """
    Wraps yf.Ticker(ticker).fast_info. Returns {} on failure.
    Lighter than full .info — good for price/market-cap only.
    """
    try:
        result = _run_with_timeout(
            lambda t=ticker: dict(yf.Ticker(t, session=_SESSION).fast_info),
            timeout=timeout,
        )
        return result or {}
    except Exception as exc:
        logger.warning("yf_safe.safe_ticker_fast_info for %s: %s", ticker, exc)
        return {}
