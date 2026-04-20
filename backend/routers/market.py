"""
Market overview router — major indices snapshot + stress indicator.
Used by Dashboard.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException

from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()

INDICES = [
    ("^GSPC",  "S&P 500"),
    ("^NDX",   "Nasdaq 100"),
    ("^DJI",   "Dow Jones"),
    ("^RUT",   "Russell 2000"),
    ("^STOXX50E", "Euro Stoxx 50"),
    ("^FTSE",  "FTSE 100"),
    ("^N225",  "Nikkei 225"),
    ("^VIX",   "VIX"),
    ("GC=F",   "Gold"),
    ("CL=F",   "Crude Oil"),
    ("BTC-USD","Bitcoin"),
    ("^TNX",   "US 10Y"),
]


@router.get("/overview")
def market_overview() -> Any:
    """
    Snapshot of major indices + stress composite.
    Stress score 0-100 from VIX, HY spread proxy, yield curve, SPX drawdown.
    """
    cached = cache.get("market_overview")
    if cached is not None:
        return cached

    rows: list[dict] = []
    closes: dict[str, pd.Series] = {}

    try:
        symbols = [s for s, _ in INDICES]
        raw = yf.download(
            tickers=symbols, period="3mo", interval="1d",
            progress=False, auto_adjust=True, group_by="ticker", threads=True,
        )
    except Exception as exc:
        logger.error("Market overview fetch error: %s", exc)
        raise HTTPException(status_code=503, detail="Market data unavailable.")

    for sym, label in INDICES:
        try:
            if isinstance(raw.columns, pd.MultiIndex):
                df = raw[sym] if sym in raw.columns.get_level_values(0) else pd.DataFrame()
            else:
                df = raw
            if df is None or df.empty or "Close" not in df.columns:
                continue
            close = df["Close"].dropna()
            if len(close) < 2:
                continue
            closes[sym] = close
            last = float(close.iloc[-1])
            prev = float(close.iloc[-2])
            d1   = (last / prev - 1.0) * 100.0

            chg_5d = float((close.iloc[-1] / close.iloc[-6] - 1.0) * 100.0) if len(close) >= 6 else None
            ytd_ref = close.iloc[0]
            chg_ytd = float((last / ytd_ref - 1.0) * 100.0)

            series = close.tail(30).round(4).tolist()
            rows.append({
                "symbol": sym,
                "label": label,
                "price": round(last, 4),
                "change_1d_pct": round(d1, 3),
                "change_5d_pct": round(chg_5d, 3) if chg_5d is not None else None,
                "change_period_pct": round(chg_ytd, 3),
                "spark": series,
            })
        except Exception as exc:
            logger.warning("Overview parse %s: %s", sym, exc)

    # ── Stress composite (0 = calm, 100 = extreme stress) ──
    stress_components: dict[str, float] = {}

    vix = closes.get("^VIX")
    if vix is not None and not vix.empty:
        v = float(vix.iloc[-1])
        stress_components["vix"] = float(np.clip((v - 12.0) / (40.0 - 12.0) * 100.0, 0, 100))

    spx = closes.get("^GSPC")
    if spx is not None and not spx.empty:
        high = float(spx.cummax().iloc[-1])
        dd   = (float(spx.iloc[-1]) / high - 1.0) * 100.0  # negative when below peak
        stress_components["spx_drawdown"] = float(np.clip(-dd * 10.0, 0, 100))  # -10% dd → 100

    tnx = closes.get("^TNX")
    if tnx is not None and not tnx.empty and len(tnx) >= 20:
        vol = float(tnx.pct_change().tail(20).std() * np.sqrt(252) * 100.0)
        stress_components["rates_vol"] = float(np.clip(vol / 0.6, 0, 100))

    if spx is not None and len(spx) >= 22:
        rv = float(spx.pct_change().tail(22).std() * np.sqrt(252) * 100.0)
        stress_components["spx_realized_vol"] = float(np.clip((rv - 10.0) / 30.0 * 100.0, 0, 100))

    if stress_components:
        stress_score = float(np.mean(list(stress_components.values())))
    else:
        stress_score = 50.0

    if stress_score < 25:
        regime = "Calm"
    elif stress_score < 50:
        regime = "Normal"
    elif stress_score < 75:
        regime = "Elevated"
    else:
        regime = "Extreme"

    result = {
        "indices": rows,
        "stress": {
            "score": round(stress_score, 1),
            "regime": regime,
            "components": {k: round(v, 1) for k, v in stress_components.items()},
        },
    }
    cache.set("market_overview", result, ttl=300)
    return result
