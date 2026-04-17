"""
Economic & corporate calendar router.
GET  /calendar/economic   — Forex Factory events (this week + next week)
POST /calendar/portfolio  — Earnings, ex-dividends, splits per ticker
"""

import logging
import math
import concurrent.futures
from typing import Any

import pandas as pd
import requests
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()

_FF_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]


def _safe(v) -> float | None:
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except Exception:
        return None


def _ts(v) -> str | None:
    if v is None:
        return None
    try:
        ts = pd.Timestamp(v)
        if pd.isna(ts):
            return None
        return ts.strftime("%Y-%m-%d")
    except Exception:
        return None


def _cal_to_dict(cal) -> dict:
    """Normalise yfinance .calendar to plain dict regardless of version."""
    if cal is None:
        return {}
    if isinstance(cal, dict):
        return cal
    # DataFrame (yfinance >= 0.2.x)
    try:
        out: dict = {}
        for col in cal.columns:
            vals = cal[col].dropna().tolist()
            out[col] = vals if len(vals) != 1 else vals[0]
        return out
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# GET /calendar/economic
# ---------------------------------------------------------------------------
@router.get("/economic")
def get_economic_calendar() -> Any:
    key = "calendar_economic"
    cached = cache.get(key)
    if cached is not None:
        return cached

    events: list[dict] = []
    for url in _FF_URLS:
        try:
            r = requests.get(
                url,
                timeout=10,
                headers={"User-Agent": "Mozilla/5.0 (compatible; CAPITALIS/2.0)"},
            )
            r.raise_for_status()
            for e in r.json():
                events.append({
                    "title":    e.get("title", ""),
                    "country":  e.get("country", ""),
                    "date":     e.get("date", ""),
                    "impact":   e.get("impact", "Low"),
                    "forecast": e.get("forecast") or None,
                    "previous": e.get("previous") or None,
                    "actual":   e.get("actual") or None,
                })
        except Exception as exc:
            logger.warning("FF calendar fetch failed (%s): %s", url, exc)

    result: dict[str, Any] = {"events": events}
    cache.set(key, result, ttl=1800)
    return result


# ---------------------------------------------------------------------------
# POST /calendar/portfolio
# ---------------------------------------------------------------------------
class PortfolioCalendarRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=50)


@router.post("/portfolio")
def get_portfolio_calendar(req: PortfolioCalendarRequest) -> Any:
    key = f"calendar_pf_{'_'.join(sorted(req.tickers))}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    def _fetch(ticker: str) -> list[dict]:
        events: list[dict] = []
        try:
            t = yf.Ticker(ticker)
            cal = _cal_to_dict(t.calendar)

            # Earnings
            earn_dates = cal.get("Earnings Date", [])
            if not isinstance(earn_dates, list):
                earn_dates = [earn_dates]
            for ed in earn_dates:
                date_str = _ts(ed)
                if date_str:
                    events.append({
                        "ticker": ticker,
                        "type":   "earnings",
                        "date":   date_str,
                        "eps_low":     _safe(cal.get("Earnings Low")),
                        "eps_high":    _safe(cal.get("Earnings High")),
                        "eps_avg":     _safe(cal.get("Earnings Average")),
                        "revenue_avg": _safe(cal.get("Revenue Average")),
                    })

            # Ex-dividend
            date_str = _ts(cal.get("Ex-Dividend Date"))
            if date_str:
                events.append({
                    "ticker": ticker,
                    "type":   "exdividend",
                    "date":   date_str,
                    "amount": None,
                })

            # Dividend pay date
            date_str = _ts(cal.get("Dividend Date"))
            if date_str:
                events.append({
                    "ticker": ticker,
                    "type":   "dividend",
                    "date":   date_str,
                    "amount": None,
                })

            # Attach last known dividend amount
            try:
                divs = t.dividends
                if divs is not None and not divs.empty:
                    last_amt = round(float(divs.iloc[-1]), 4)
                    for ev in events:
                        if ev["type"] in ("exdividend", "dividend"):
                            ev["amount"] = last_amt
            except Exception:
                pass

            # Next split
            try:
                splits = t.splits
                if splits is not None and not splits.empty:
                    today = pd.Timestamp.now(tz="UTC").normalize()
                    fut = splits[splits.index >= today]
                    if not fut.empty:
                        events.append({
                            "ticker": ticker,
                            "type":   "split",
                            "date":   _ts(fut.index[0]),
                            "ratio":  round(float(fut.iloc[0]), 4),
                        })
            except Exception:
                pass

        except Exception as exc:
            logger.warning("Calendar fetch failed for %s: %s", ticker, exc)

        return events

    all_events: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for ticker_events in pool.map(_fetch, req.tickers):
            all_events.extend(ticker_events)

    all_events.sort(key=lambda e: e.get("date") or "")
    result: dict[str, Any] = {"events": all_events}
    cache.set(key, result, ttl=3600)
    return result
