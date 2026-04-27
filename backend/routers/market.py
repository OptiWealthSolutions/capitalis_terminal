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


# ---------------------------------------------------------------------------
# Sector ETF constants
# ---------------------------------------------------------------------------
SECTOR_ETFS = [
    ("XLK",  "Technology"),
    ("XLF",  "Financials"),
    ("XLV",  "Healthcare"),
    ("XLE",  "Energy"),
    ("XLY",  "Consumer Disc."),
    ("XLP",  "Consumer Staples"),
    ("XLI",  "Industrials"),
    ("XLB",  "Materials"),
    ("XLU",  "Utilities"),
    ("XLRE", "Real Estate"),
    ("XLC",  "Communication"),
]


# ---------------------------------------------------------------------------
# GET /market/sectors
# ---------------------------------------------------------------------------
@router.get("/sectors")
def get_sector_data() -> Any:
    cached = cache.get("market_sectors")
    if cached is not None:
        return cached

    tickers = [etf for etf, _ in SECTOR_ETFS]
    try:
        raw = yf.download(
            tickers, period="1y", interval="1d",
            progress=False, auto_adjust=True,
            group_by="ticker", threads=True,
        )
    except Exception as exc:
        logger.error("Sector data fetch error: %s", exc)
        raise HTTPException(status_code=503, detail="Sector data unavailable.")

    sectors: list[dict] = []
    for etf, name in SECTOR_ETFS:
        try:
            if isinstance(raw.columns, pd.MultiIndex):
                df = raw[etf] if etf in raw.columns.get_level_values(0) else pd.DataFrame()
            else:
                df = raw
            if df.empty or "Close" not in df.columns:
                continue
            close = df["Close"].dropna()
            if len(close) < 5:
                continue

            price = float(close.iloc[-1])
            prev  = float(close.iloc[-2])
            m1    = float(close.iloc[-22]) if len(close) >= 22 else float(close.iloc[0])
            m3    = float(close.iloc[-66]) if len(close) >= 66 else float(close.iloc[0])
            y1    = float(close.iloc[0])

            # RSI-14
            delta = close.diff().tail(15)
            gain  = delta.clip(lower=0).mean()
            loss  = (-delta.clip(upper=0)).mean()
            rsi   = float(100 - 100 / (1 + gain / loss)) if loss != 0 else 100.0

            ma50  = float(close.tail(50).mean())
            ma200 = float(close.tail(200).mean()) if len(close) >= 200 else float(close.mean())

            high_52w = float(close.max())
            low_52w  = float(close.min())
            pos_52w  = round((price - low_52w) / (high_52w - low_52w) * 100, 1) if high_52w > low_52w else 50.0
            from_hi  = round((price / high_52w - 1) * 100, 2)

            vol = df["Volume"].dropna() if "Volume" in df.columns else pd.Series(dtype=float)
            vol_ratio = None
            if len(vol) >= 20:
                vol_20d = float(vol.tail(20).mean())
                vol_ratio = round(float(vol.iloc[-1]) / vol_20d, 2) if vol_20d > 0 else None

            sectors.append({
                "etf":              etf,
                "sector":           name,
                "price":            round(price, 2),
                "change_1d_pct":    round((price - prev) / prev * 100, 2),
                "change_1m_pct":    round((price - m1)   / m1   * 100, 2),
                "change_3m_pct":    round((price - m3)   / m3   * 100, 2),
                "change_1y_pct":    round((price - y1)   / y1   * 100, 2),
                "rsi_14":           round(rsi, 1),
                "above_50ma":       bool(price > ma50),
                "above_200ma":      bool(price > ma200),
                "position_52w_pct": pos_52w,
                "from_52w_high_pct": from_hi,
                "vol_ratio":        vol_ratio,
                "spark_30d":        [round(float(v), 2) for v in close.tail(30).tolist()],
                "spark_1y":         [round(float(v), 2) for v in close.tolist()],
                "dates_1y":         [str(d)[:10] for d in close.index.tolist()],
            })
        except Exception as exc:
            logger.warning("Sector parse %s: %s", etf, exc)

    result = {"sectors": sectors}
    cache.set("market_sectors", result, ttl=300)
    return result


# ---------------------------------------------------------------------------
# GET /market/news
# ---------------------------------------------------------------------------
@router.get("/news")
def get_market_news() -> Any:
    cached = cache.get("market_news")
    if cached is not None:
        return cached

    from datetime import datetime, timezone

    def _parse_ts(pub_date: str) -> int:
        """ISO-8601 pubDate (e.g. '2026-04-26T15:46:02Z') → unix timestamp."""
        try:
            s = pub_date.replace("Z", "+00:00")
            return int(datetime.fromisoformat(s).timestamp())
        except Exception:
            return 0

    def _extract_item(item: dict) -> dict | None:
        """Support both yfinance v1 (flat) and v2 (nested under 'content')."""
        content = item.get("content") or {}
        if content:
            # yfinance ≥ 0.2.48 — all metadata nested under content
            link = (content.get("canonicalUrl") or {}).get("url", "") or \
                   (content.get("clickThroughUrl") or {}).get("url", "")
            if not link:
                return None
            thumb = ""
            try:
                resolutions = (content.get("thumbnail") or {}).get("resolutions") or []
                if resolutions:
                    # prefer index 1 (170×128) over index 0 (smaller)
                    r = resolutions[1] if len(resolutions) > 1 else resolutions[0]
                    thumb = r.get("url", "")
            except Exception:
                pass
            related = content.get("finance", {}).get("stockTickers") or []
            tickers = [t.get("symbol", "") for t in related if t.get("symbol")]
            pub_date = content.get("pubDate", "")
            return {
                "title":     content.get("title", ""),
                "publisher": (content.get("provider") or {}).get("displayName", ""),
                "link":      link,
                "published": _parse_ts(pub_date),
                "tickers":   tickers,
                "thumbnail": thumb,
            }
        else:
            # yfinance v1 legacy flat structure
            link = item.get("link") or item.get("url") or ""
            if not link:
                return None
            thumb = ""
            try:
                resolutions = (item.get("thumbnail") or {}).get("resolutions") or []
                if resolutions:
                    thumb = resolutions[0].get("url", "")
            except Exception:
                pass
            return {
                "title":     item.get("title", ""),
                "publisher": item.get("publisher", ""),
                "link":      link,
                "published": item.get("providerPublishTime", 0),
                "tickers":   item.get("relatedTickers", []),
                "thumbnail": thumb,
            }

    source_tickers = ["SPY", "QQQ", "GLD", "TLT", "^TNX"]
    all_news: list[dict] = []
    seen_links: set[str] = set()

    for sym in source_tickers:
        try:
            items = yf.Ticker(sym).news or []
            for raw_item in items[:10]:
                parsed = _extract_item(raw_item)
                if not parsed or parsed["link"] in seen_links:
                    continue
                seen_links.add(parsed["link"])
                all_news.append(parsed)
        except Exception as exc:
            logger.warning("News fetch %s: %s", sym, exc)

    all_news.sort(key=lambda x: x["published"], reverse=True)
    result = {"news": all_news[:25]}
    cache.set("market_news", result, ttl=600)
    return result


# ---------------------------------------------------------------------------
# GET /market/breadth
# ---------------------------------------------------------------------------
@router.get("/breadth")
def get_market_breadth() -> Any:
    cached = cache.get("market_breadth")
    if cached is not None:
        return cached

    try:
        sector_result = get_sector_data()
    except Exception:
        raise HTTPException(status_code=503, detail="Breadth data unavailable.")

    sectors = sector_result.get("sectors", [])
    total   = len(sectors)
    above_200 = sum(1 for s in sectors if s.get("above_200ma"))
    above_50  = sum(1 for s in sectors if s.get("above_50ma"))
    avg_rsi   = round(sum(s.get("rsi_14", 50) for s in sectors) / total, 1) if total else 50.0

    # ── Fear & Greed (0 = extreme fear, 100 = extreme greed) ──
    fear_greed = 50.0
    fg_label   = "Neutral"
    try:
        fg_raw = yf.download(
            ["^VIX", "^GSPC", "TLT", "^IRX"], period="6mo", interval="1d",
            progress=False, auto_adjust=True, group_by="ticker", threads=True,
        )
        comps: list[float] = []

        def _series(sym: str) -> pd.Series | None:
            if isinstance(fg_raw.columns, pd.MultiIndex):
                return fg_raw[sym]["Close"].dropna() if sym in fg_raw.columns.get_level_values(0) else None
            return fg_raw["Close"].dropna() if len([s for s, _ in [("^VIX", "")]] ) == 1 else None

        vix_c = _series("^VIX")
        spx_c = _series("^GSPC")
        tlt_c = _series("TLT")
        irx_c = _series("^IRX")

        if vix_c is not None and len(vix_c) > 0:
            v = float(vix_c.iloc[-1])
            comps.append(float(np.clip(100 - (v - 10) / 30 * 100, 0, 100)))

        if spx_c is not None and len(spx_c) >= 20:
            ma125 = float(spx_c.tail(min(125, len(spx_c))).mean())
            ratio = float(spx_c.iloc[-1]) / ma125
            comps.append(float(np.clip((ratio - 0.9) / 0.2 * 100, 0, 100)))

        if total > 0:
            comps.append(above_200 / total * 100.0)

        comps.append(float(np.clip((avg_rsi - 30) / 40 * 100, 0, 100)))

        if tlt_c is not None and spx_c is not None and len(tlt_c) >= 22 and len(spx_c) >= 22:
            tlt_1m = float((tlt_c.iloc[-1] / tlt_c.iloc[-22] - 1) * 100)
            spx_1m = float((spx_c.iloc[-1] / spx_c.iloc[-22] - 1) * 100)
            sh = float(np.clip((spx_1m - tlt_1m + 10) / 20 * 100, 0, 100))
            comps.append(sh)

        if comps:
            fear_greed = round(float(np.mean(comps)), 1)

        fg_label = (
            "Extreme Fear" if fear_greed < 25 else
            "Fear"         if fear_greed < 45 else
            "Neutral"      if fear_greed < 55 else
            "Greed"        if fear_greed < 75 else
            "Extreme Greed"
        )

        # Yield curve spread (10Y - 3M) in bps
        yield_spread = None
        if irx_c is not None and len(irx_c) > 0 and vix_c is not None:
            tnx_data = yf.download("^TNX", period="5d", interval="1d", progress=False, auto_adjust=True)
            if not tnx_data.empty:
                tnx_val = float(tnx_data["Close"].dropna().iloc[-1])
                irx_val = float(irx_c.iloc[-1])
                yield_spread = round(tnx_val - irx_val, 2)
    except Exception as exc:
        logger.warning("Fear & Greed calc error: %s", exc)

    result = {
        "total":               total,
        "sectors_above_200ma": above_200,
        "sectors_above_50ma":  above_50,
        "avg_rsi":             avg_rsi,
        "bullish":  sum(1 for s in sectors if s.get("above_200ma") and s.get("change_1m_pct", 0) > 0),
        "bearish":  sum(1 for s in sectors if not s.get("above_200ma") and s.get("change_1m_pct", 0) < 0),
        "fear_greed":       fear_greed,
        "fear_greed_label": fg_label,
        "yield_spread":     yield_spread,
    }
    cache.set("market_breadth", result, ttl=300)
    return result


# ---------------------------------------------------------------------------
# GET /market/macro
# ---------------------------------------------------------------------------
MACRO_TICKERS = [
    ("^GSPC",   "S&P 500",  "equity"),
    ("^NDX",    "Nasdaq 100","equity"),
    ("^VIX",    "VIX",      "volatility"),
    ("^TNX",    "US 10Y",   "rates"),
    ("^TYX",    "US 30Y",   "rates"),
    ("^IRX",    "US 3M",    "rates"),
    ("UUP",     "DXY",      "currency"),
    ("GC=F",    "Gold",     "commodities"),
    ("CL=F",    "Crude Oil","commodities"),
    ("TLT",     "TLT 20Y",  "bonds"),
    ("HYG",     "HY Bonds", "bonds"),
    ("BTC-USD", "Bitcoin",  "crypto"),
]


@router.get("/macro")
def get_macro_data() -> Any:
    cached = cache.get("market_macro")
    if cached is not None:
        return cached

    tickers = [t for t, _, _ in MACRO_TICKERS]
    try:
        raw = yf.download(
            tickers, period="3mo", interval="1d",
            progress=False, auto_adjust=True, group_by="ticker", threads=True,
        )
    except Exception as exc:
        logger.error("Macro fetch error: %s", exc)
        raise HTTPException(status_code=503, detail="Macro data unavailable.")

    items: list[dict] = []
    for sym, label, category in MACRO_TICKERS:
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

            price = float(close.iloc[-1])
            prev  = float(close.iloc[-2])
            w1    = float(close.iloc[-6])  if len(close) >= 6  else float(close.iloc[0])
            m1    = float(close.iloc[-22]) if len(close) >= 22 else float(close.iloc[0])
            m3    = float(close.iloc[0])

            items.append({
                "symbol":       sym,
                "label":        label,
                "category":     category,
                "price":        round(price, 4),
                "change_1d_pct": round((price / prev - 1) * 100, 2),
                "change_1w_pct": round((price / w1  - 1) * 100, 2),
                "change_1m_pct": round((price / m1  - 1) * 100, 2),
                "change_3m_pct": round((price / m3  - 1) * 100, 2),
                "spark": [round(float(v), 4) for v in close.tail(30).tolist()],
            })
        except Exception as exc:
            logger.warning("Macro parse %s: %s", sym, exc)

    # Yield curve spread (10Y - 3M)
    tnx = next((i for i in items if i["symbol"] == "^TNX"), None)
    irx = next((i for i in items if i["symbol"] == "^IRX"), None)
    curve_spread = None
    if tnx and irx:
        curve_spread = round(tnx["price"] - irx["price"], 2)

    result = {
        "macro": items,
        "curve_spread": curve_spread,
        "inverted": bool(curve_spread is not None and curve_spread < 0),
    }
    cache.set("market_macro", result, ttl=300)
    return result
