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

    if not info or info.get("marketCap") is None:
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
    """Annual + quarterly income statement and cash flow metrics."""
    t = _assert_valid_ticker(ticker)
    key = f"equity_fin_{t}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        tkr = yf.Ticker(t)
        inc_ann = tkr.income_stmt
        inc_q   = tkr.quarterly_income_stmt
        cf_ann = getattr(tkr, "cashflow", None)
        if cf_ann is None:
            cf_ann = getattr(tkr, "cash_flow", None)
        cf_q = getattr(tkr, "quarterly_cashflow", None)
        if cf_q is None:
            cf_q = getattr(tkr, "quarterly_cash_flow", None)
    except Exception as exc:
        logger.error("yfinance financials %s: %s", t, exc)
        raise HTTPException(status_code=503, detail="Financial data unavailable.")

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
    cache.set(key, result, ttl=86400)
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
        tkr = yf.Ticker(t)
        inst = getattr(tkr, "institutional_holders", None)
        mf   = getattr(tkr, "mutualfund_holders", None)
        major = getattr(tkr, "major_holders", None)
        insider_tx = getattr(tkr, "insider_transactions", None)
        insider_pct = getattr(tkr, "insider_roster_holders", None)
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
            tkr = yf.Ticker(sym)

            cal = getattr(tkr, "calendar", None)
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
