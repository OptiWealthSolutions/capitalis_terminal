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
from ..equity_cache import (
    read as eq_cache_read,
    read_stale as eq_cache_stale,
    write as eq_cache_write,
)
from ..yf_safe import safe_download, safe_ticker_info

logger = logging.getLogger(__name__)
router = APIRouter()

_TICKER_RE = re.compile(r"^[A-Z0-9.\-\^=]{1,12}$")


def _assert_valid_ticker(ticker: str) -> str:
    t = ticker.strip().upper()
    if not _TICKER_RE.match(t):
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {ticker!r}")
    return t


# ---------------------------------------------------------------------------
# GET /equity/search?q=...
# ---------------------------------------------------------------------------
@router.get("/search")
def search_equity(q: str, limit: int = 10) -> Any:
    """Search tickers by company name or symbol using Yahoo Finance search API."""
    import requests
    q = q.strip()[:100]  # cap length, strip whitespace
    if not q or len(q) < 1:
        return {"results": []}
    try:
        resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q, "quotesCount": min(limit, 20), "newsCount": 0, "enableFuzzyQuery": False},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        data = resp.json()
        quotes = data.get("quotes", [])
        results = []
        for item in quotes:
            if item.get("quoteType") not in ("EQUITY", "ETF"):
                continue
            results.append({
                "ticker": item.get("symbol", ""),
                "name": item.get("longname") or item.get("shortname") or "",
                "exchange": item.get("exchDisp", ""),
                "type": item.get("quoteType", ""),
            })
        return {"results": results[:limit]}
    except Exception:
        return {"results": []}


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
        df = safe_download(t, period=period, interval=interval)
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for ticker {t!r}.")

        # Flatten MultiIndex columns produced by single-ticker downloads in yfinance >= 0.2.x
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] for col in df.columns]

        close = df["Close"].squeeze()
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
        "open": df["Open"].squeeze().round(4).tolist(),
        "high": df["High"].squeeze().round(4).tolist(),
        "low": df["Low"].squeeze().round(4).tolist(),
        "close": df["Close"].squeeze().round(4).tolist(),
        "volume": df["Volume"].squeeze().tolist(),
        "sma_50": df["SMA_50"].squeeze().round(4).tolist(),
        "sma_200": df["SMA_200"].squeeze().round(4).tolist(),
    }
    cache.set(key, result, ttl=EQUITY_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/fundamentals
# ---------------------------------------------------------------------------
@router.get("/{ticker}/fundamentals")
def get_fundamentals(ticker: str) -> Any:
    """yfinance fast_info + .info fundamental data. Falls back to SQLite cache."""
    t = _assert_valid_ticker(ticker)
    mem_key = f"equity_fund_{t}"

    # 1. Memory cache
    cached = cache.get(mem_key)
    if cached is not None:
        return cached

    # 2. SQLite fresh cache (< 4h)
    db_fresh = eq_cache_read(t, "fundamentals", ttl=4 * 3600)
    if db_fresh is not None:
        cache.set(mem_key, db_fresh, ttl=EQUITY_TTL)
        return db_fresh

    # 3. Fetch from yfinance (with timeout + retry via yf_safe)
    info = safe_ticker_info(t, cache_fallback=False)
    yf_ok = bool(info and info.get("marketCap") is not None)

    if not yf_ok:
        # 4. Fallback: any cached data regardless of age
        stale = eq_cache_stale(t, "fundamentals")
        if stale:
            logger.info("Serving stale fundamentals for %s from SQLite", t)
            cache.set(mem_key, stale, ttl=300)
            return stale
        raise HTTPException(status_code=503, detail="Fundamentals temporarily unavailable.")

    selected_fields = [
        "longName", "sector", "industry", "country", "currency",
        "currentPrice", "previousClose", "regularMarketOpen",
        "dayLow", "dayHigh", "fiftyTwoWeekLow", "fiftyTwoWeekHigh",
        "fiftyDayAverage", "twoHundredDayAverage",
        "volume", "averageVolume", "averageVolume10days",
        "marketCap", "enterpriseValue", "forwardPE", "trailingPE",
        "priceToBook", "priceToSalesTrailing12Months",
        "enterpriseToEbitda", "enterpriseToRevenue", "pegRatio",
        "returnOnEquity", "returnOnAssets",
        "grossMargins", "operatingMargins", "profitMargins", "ebitdaMargins",
        "earningsGrowth", "revenueGrowth", "dividendYield",
        "dividendRate", "exDividendDate", "payoutRatio",
        "debtToEquity", "currentRatio", "quickRatio",
        "totalRevenue", "netIncomeToCommon", "freeCashflow",
        "operatingCashflow", "ebitda", "totalDebt", "totalCash",
        "trailingEps", "forwardEps", "revenuePerShare",
        "sharesOutstanding", "floatShares", "bookValue", "beta",
        "shortPercentOfFloat", "heldPercentInsiders", "heldPercentInstitutions",
        "fullTimeEmployees", "auditRisk", "boardRisk",
        "targetHighPrice", "targetLowPrice", "targetMeanPrice", "targetMedianPrice",
        "recommendationMean", "numberOfAnalystOpinions",
        "longBusinessSummary",
    ]
    result = {k: info.get(k) for k in selected_fields}
    result["ticker"] = t

    # Normalize common field aliases across yfinance versions
    if result.get("currentPrice") is None:
        result["currentPrice"] = info.get("regularMarketPrice") or info.get("navPrice")
    if result.get("previousClose") is None:
        result["previousClose"] = info.get("regularMarketPreviousClose")
    if result.get("marketCap") is None:
        result["marketCap"] = info.get("marketCapitalization")
    if result.get("trailingPE") is None:
        result["trailingPE"] = info.get("trailingPe") or info.get("pe_ratio")
    if result.get("forwardPE") is None:
        result["forwardPE"] = info.get("forwardPe")
    if result.get("priceToBook") is None:
        result["priceToBook"] = info.get("price_to_book")
    if result.get("returnOnEquity") is None:
        result["returnOnEquity"] = info.get("return_on_equity")
    if result.get("grossMargins") is None:
        result["grossMargins"] = info.get("gross_margins") or info.get("grossProfitMargins")
    if result.get("operatingMargins") is None:
        result["operatingMargins"] = info.get("operating_margins")
    if result.get("profitMargins") is None:
        result["profitMargins"] = info.get("profit_margins") or info.get("netMargins")
    if result.get("debtToEquity") is None:
        result["debtToEquity"] = info.get("debt_to_equity")
    if result.get("dividendYield") is None:
        result["dividendYield"] = info.get("yield") or info.get("trailingAnnualDividendYield")

    # Persist to SQLite + memory cache
    eq_cache_write(t, "fundamentals", result)
    cache.set(mem_key, result, ttl=EQUITY_TTL)
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
        df = safe_download(t, period="5y", interval="1d")
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No price data for {t!r}.")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] for col in df.columns]
        close = df["Close"].squeeze()
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


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/financials
# ---------------------------------------------------------------------------
@router.get("/{ticker}/financials")
def get_financials(ticker: str) -> Any:
    """Annual + quarterly income statement and cash flow metrics. Falls back to SQLite cache."""
    t = _assert_valid_ticker(ticker)
    mem_key = f"equity_fin_{t}"

    # 1. Memory cache
    cached = cache.get(mem_key)
    if cached is not None:
        return cached

    # 2. SQLite fresh cache (< 24h)
    db_fresh = eq_cache_read(t, "financials", ttl=24 * 3600)
    if db_fresh is not None:
        cache.set(mem_key, db_fresh, ttl=86400)
        return db_fresh

    # 3. Fetch from yfinance (with timeout + retry)
    yf_ok = True
    inc_ann = inc_q = cf_ann = cf_q = None
    try:
        from backend.yf_safe import _run_with_timeout
        tkr = yf.Ticker(t)
        def _fetch_financials(_tkr=tkr):
            return (
                _tkr.income_stmt,
                _tkr.quarterly_income_stmt,
                getattr(_tkr, "cashflow", None) or getattr(_tkr, "cash_flow", None),
                getattr(_tkr, "quarterly_cashflow", None) or getattr(_tkr, "quarterly_cash_flow", None),
            )
        result = _run_with_timeout(_fetch_financials, timeout=30)
        if result:
            inc_ann, inc_q, cf_ann, cf_q = result
    except Exception as exc:
        logger.warning("yfinance financials %s: %s", t, exc)
        yf_ok = False

    if not yf_ok or inc_ann is None:
        # 4. Fallback: any cached data regardless of age
        stale = eq_cache_stale(t, "financials")
        if stale:
            logger.info("Serving stale financials for %s from SQLite", t)
            cache.set(mem_key, stale, ttl=300)
            return stale
        raise HTTPException(status_code=503, detail="Financial data temporarily unavailable.")

    def _safe_v(v: Any) -> float | None:
        try:
            f = float(v)
            return None if (np.isnan(f) or np.isinf(f)) else round(f, 2)
        except (TypeError, ValueError):
            return None

    def _row(df: pd.DataFrame, *names: str) -> "pd.Series | None":
        for name in names:
            if name in df.index:
                return df.loc[name]
        return None

    def _extract(inc: "pd.DataFrame | None", cf: "pd.DataFrame | None") -> dict:
        if inc is None or inc.empty:
            return {}

        inc = inc[sorted(inc.columns)]
        dates = [d.strftime("%Y-%m-%d") for d in inc.columns]
        n = len(dates)

        def get_series(*names: str) -> list:
            s = _row(inc, *names)
            return [_safe_v(v) for v in s.tolist()] if s is not None else [None] * n

        revenue    = get_series("Total Revenue", "TotalRevenue")
        net_income = get_series("Net Income", "NetIncome")
        gp         = get_series("Gross Profit", "GrossProfit")
        op_income  = get_series("Operating Income", "EBIT", "OperatingIncome")
        ebitda     = get_series("EBITDA", "Ebitda")
        eps        = get_series("Diluted EPS", "Basic EPS", "BasicEPS")

        fcf = [None] * n
        if cf is not None and not cf.empty:
            cf_sorted = cf[sorted(cf.columns)]
            fcf_series = _row(cf_sorted, "Free Cash Flow", "FreeCashFlow")
            if fcf_series is not None:
                cf_map = {d: _safe_v(v) for d, v in fcf_series.items()}
                fcf = [cf_map.get(d) for d in inc.columns]

        def margins(num: list, den: list) -> list:
            return [
                round(a / b * 100, 2) if (a is not None and b and b != 0) else None
                for a, b in zip(num, den)
            ]

        return {
            "dates":            dates,
            "revenue":          revenue,
            "net_income":       net_income,
            "gross_profit":     gp,
            "operating_income": op_income,
            "ebitda":           ebitda,
            "free_cash_flow":   fcf,
            "eps_diluted":      eps,
            "gross_margin":     margins(gp, revenue),
            "operating_margin": margins(op_income, revenue),
            "net_margin":       margins(net_income, revenue),
        }

    result = {
        "annual":    _extract(inc_ann, cf_ann),
        "quarterly": _extract(inc_q, cf_q),
    }
    eq_cache_write(t, "financials", result)
    cache.set(mem_key, result, ttl=86400)
    return result


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/holders — institutional + insiders
# ---------------------------------------------------------------------------
@router.get("/{ticker}/holders")
def get_holders(ticker: str) -> Any:
    t = _assert_valid_ticker(ticker)
    key = f"holders_{t}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        from backend.yf_safe import _run_with_timeout
        tkr = yf.Ticker(t)
        def _fetch_holders(_tkr=tkr):
            return (
                getattr(_tkr, "institutional_holders", None),
                getattr(_tkr, "mutualfund_holders", None),
                getattr(_tkr, "major_holders", None),
                getattr(_tkr, "insider_transactions", None),
                getattr(_tkr, "insider_roster_holders", None),
            )
        _res = _run_with_timeout(_fetch_holders, timeout=25)
        inst, mf, major, insider_tx, insider_pct = _res if _res else (None, None, None, None, None)
    except Exception as exc:
        logger.error("Holders fetch %s: %s", t, exc)
        raise HTTPException(status_code=503, detail="Holder data unavailable.")

    def _df_to_rows(df: Any, cols: list[str]) -> list[dict]:
        if df is None or not isinstance(df, pd.DataFrame) or df.empty:
            return []
        out = []
        for _, row in df.iterrows():
            r = {}
            for c in cols:
                if c in row.index:
                    v = row[c]
                    if isinstance(v, (pd.Timestamp,)):
                        r[c] = v.strftime("%Y-%m-%d")
                    elif hasattr(v, "item"):
                        try:
                            r[c] = v.item()
                        except Exception:
                            r[c] = str(v)
                    else:
                        r[c] = None if pd.isna(v) else (float(v) if isinstance(v, (int, float, np.floating)) else str(v))
            out.append(r)
        return out

    major_summary = None
    if isinstance(major, pd.DataFrame) and not major.empty:
        try:
            if major.shape[1] >= 1:
                values = major.iloc[:, 0].tolist()
                labels = major.iloc[:, 1].tolist() if major.shape[1] >= 2 else major.index.tolist()
                major_summary = [{"label": str(l), "value": str(v)} for v, l in zip(values, labels)]
        except Exception:
            major_summary = None

    result = {
        "ticker": t,
        "major_summary": major_summary,
        "institutional": _df_to_rows(inst, ["Date Reported", "Holder", "pctHeld", "Shares", "Value"])[:20],
        "mutualfunds":   _df_to_rows(mf,   ["Date Reported", "Holder", "pctHeld", "Shares", "Value"])[:20],
        "insider_transactions": _df_to_rows(insider_tx, ["Start Date", "Insider", "Position", "Transaction", "Shares", "Value"])[:30],
        "insider_roster":       _df_to_rows(insider_pct, ["Name", "Position", "Most Recent Transaction", "Latest Transaction Date", "Shares Owned Directly"])[:20],
    }
    cache.set(key, result, ttl=6 * 3600)
    return result


# ---------------------------------------------------------------------------
# GET /equity/events?tickers=AAPL,MSFT
# Next earnings + next dividend date per ticker. Used by Dashboard page.
# ---------------------------------------------------------------------------
@router.get("/events")
def get_corporate_events(tickers: str = Query(..., min_length=1, max_length=512)) -> Any:
    syms = [_assert_valid_ticker(s) for s in tickers.split(",") if s.strip()]
    if not syms:
        raise HTTPException(status_code=400, detail="No valid tickers provided.")

    key = f"events_{','.join(syms)}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    today = pd.Timestamp.utcnow().normalize().tz_localize(None)
    out: list[dict] = []

    for sym in syms:
        rec: dict = {"ticker": sym, "next_earnings": None, "next_dividend": None, "dividend_rate": None}
        try:
            from backend.yf_safe import _run_with_timeout
            tkr = yf.Ticker(sym)
            cal = _run_with_timeout(lambda _t=tkr: getattr(_t, "calendar", None), timeout=15) or None
            earn_date = None
            if isinstance(cal, dict):
                ev = cal.get("Earnings Date")
                if isinstance(ev, list) and ev:
                    earn_date = pd.Timestamp(ev[0])
                elif ev is not None:
                    earn_date = pd.Timestamp(ev)
            elif isinstance(cal, pd.DataFrame) and "Earnings Date" in cal.index:
                raw = cal.loc["Earnings Date"].iloc[0]
                earn_date = pd.Timestamp(raw) if raw is not None else None
            if earn_date is not None and not pd.isna(earn_date):
                earn_date = earn_date.tz_localize(None) if earn_date.tz is not None else earn_date
                if earn_date >= today:
                    rec["next_earnings"] = earn_date.strftime("%Y-%m-%d")

            divs = tkr.dividends
            if divs is not None and not divs.empty:
                last = divs.index[-1]
                last = last.tz_localize(None) if last.tz is not None else last
                info = getattr(tkr, "info", {}) or {}
                ex_div = info.get("exDividendDate")
                if ex_div:
                    ex = pd.to_datetime(ex_div, unit="s", errors="coerce")
                    if pd.notna(ex) and ex >= today:
                        rec["next_dividend"] = ex.strftime("%Y-%m-%d")
                if rec["next_dividend"] is None:
                    rec["next_dividend"] = last.strftime("%Y-%m-%d")
                rec["dividend_rate"] = float(divs.iloc[-1])
        except Exception as exc:
            logger.warning("Events fetch failed for %s: %s", sym, exc)
        out.append(rec)

    result = {"events": out}
    cache.set(key, result, ttl=3600)
    return result


# ---------------------------------------------------------------------------
# GET /equity/{ticker}/logo
# Returns logo URL via Clearbit (free, no key) using yfinance website lookup.
# Cached 24h. Falls back to null if domain unresolvable (frontend renders initials).
# ---------------------------------------------------------------------------
@router.get("/{ticker}/logo")
def get_logo(ticker: str) -> Any:
    tk = ticker.upper().strip()
    if not re.fullmatch(r"[A-Z0-9.\-^]{1,12}", tk):
        raise HTTPException(status_code=400, detail="Invalid ticker.")

    cache_key = f"logo:{tk}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    domain: str | None = None
    try:
        info = safe_ticker_info(tk, cache_fallback=True)
        site = info.get("website") or ""
        if site:
            domain = re.sub(r"^https?://(www\.)?", "", site).split("/")[0].strip().lower() or None
    except Exception as e:
        logger.warning("logo lookup failed for %s: %s", tk, e)

    result = {
        "ticker": tk,
        "domain": domain,
        "url": f"https://logo.clearbit.com/{domain}" if domain else None,
    }
    cache.set(cache_key, result, ttl=86_400)
    return result
