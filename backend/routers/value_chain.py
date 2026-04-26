"""
Value-chain / market-map endpoint.

GET /api/value-chain   — Sunburst data: Sector → Industry → Ticker
                         Derived from equity_scored.csv + live yfinance industry data (cached 6h)
"""

import logging
import time
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends

from ..auth.jwt_handler import get_current_user
from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()

ROOT = Path(__file__).resolve().parent.parent.parent
SCORED_CSV = ROOT / "data" / "equity_scored.csv"

# Sector hex colours — one per canonical sector name
SECTOR_COLORS: dict[str, str] = {
    "Technology":                 "#7AA7E8",
    "Healthcare":                 "#86B38A",
    "Financials":                 "#C9B178",
    "Consumer Discretionary":     "#D48585",
    "Communication Services":     "#A97CC0",
    "Industrials":                "#5BBCB8",
    "Consumer Staples":           "#E8A87C",
    "Energy":                     "#F97316",
    "Materials":                  "#8BBCCC",
    "Real Estate":                "#B5A0D4",
    "Utilities":                  "#B5CC8E",
    "Inconnu":                    "#666666",
}


def _sector_color(sector: str) -> str:
    return SECTOR_COLORS.get(sector, "#888888")


def _load_industry_cache() -> dict[str, str]:
    """Try to load ticker→industry from yfinance; cache 6h."""
    cache_key = "value_chain_industries"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    industries: dict[str, str] = {}
    try:
        df = pd.read_csv(SCORED_CSV)
        if df.empty or "Ticker" not in df.columns:
            return industries
        tickers = df["Ticker"].dropna().unique().tolist()

        import yfinance as yf
        import concurrent.futures

        def fetch_industry(ticker: str) -> tuple[str, str]:
            try:
                info = yf.Ticker(ticker).fast_info
                # fast_info doesn't have industry; use full info
                full = yf.Ticker(ticker).info
                return ticker, full.get("industry", "")
            except Exception:
                return ticker, ""

        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
            for t, ind in ex.map(fetch_industry, tickers[:200]):  # cap at 200
                industries[t] = ind or ""

    except Exception as e:
        logger.warning("value_chain industry fetch failed: %s", e)

    # Cache 6h = 21600s
    cache.set(cache_key, industries, ttl=21600)
    return industries


def _build_sunburst() -> dict[str, Any]:
    """Build Plotly sunburst payload from scored CSV."""
    cache_key = "value_chain_sunburst"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        df = pd.read_csv(SCORED_CSV)
    except Exception:
        return {"ids": [], "labels": [], "parents": [], "values": [], "colors": [], "text": []}

    required = {"Ticker", "Total_Score"}
    if not required.issubset(df.columns):
        return {"ids": [], "labels": [], "parents": [], "values": [], "colors": [], "text": []}

    if "Sector" not in df.columns:
        df["Sector"] = "Unknown"
    else:
        df["Sector"] = df["Sector"].fillna("Unknown")

    if "Name" not in df.columns:
        df["Name"] = df["Ticker"]
    else:
        df["Name"] = df["Name"].fillna(df["Ticker"])

    df["Total_Score"] = pd.to_numeric(df["Total_Score"], errors="coerce").fillna(0)
    # Normalise to 0–100 for sizing
    mn, mx = df["Total_Score"].min(), df["Total_Score"].max()
    if mx > mn:
        df["_score_norm"] = ((df["Total_Score"] - mn) / (mx - mn) * 99 + 1).round(1)
    else:
        df["_score_norm"] = 50.0

    industries = _load_industry_cache()

    ids:     list[str]   = ["MARKET"]
    labels:  list[str]   = ["Market"]
    parents: list[str]   = [""]
    values:  list[float] = [0.0]
    colors:  list[str]   = ["#333333"]
    text:    list[str]   = [""]

    seen_sectors:   set[str] = set()
    seen_industries: set[str] = set()

    for _, row in df.iterrows():
        ticker = str(row["Ticker"])
        name   = str(row["Name"])
        sector = str(row["Sector"])
        score  = float(row["_score_norm"])
        industry = industries.get(ticker, "").strip() or "Other"

        sector_id   = f"S_{sector}"
        industry_id = f"I_{sector}__{industry}"

        # Sector node
        if sector_id not in seen_sectors:
            seen_sectors.add(sector_id)
            ids.append(sector_id)
            labels.append(sector)
            parents.append("MARKET")
            values.append(0.0)
            colors.append(_sector_color(sector))
            text.append("")

        # Industry node
        if industry_id not in seen_industries:
            seen_industries.add(industry_id)
            ids.append(industry_id)
            labels.append(industry)
            parents.append(sector_id)
            values.append(0.0)
            colors.append(_sector_color(sector) + "99")  # semi-transparent
            text.append("")

        # Ticker leaf
        ids.append(f"T_{ticker}")
        labels.append(ticker)
        parents.append(industry_id)
        values.append(score)
        colors.append(_sector_color(sector) + "bb")
        text.append(f"{name}<br>Score: {score:.1f}")

    result = {
        "ids": ids, "labels": labels, "parents": parents,
        "values": values, "colors": colors, "text": text,
    }
    cache.set(cache_key, result, ttl=3600)
    return result


@router.get("")
def get_value_chain(_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Return sunburst data for the Market Map page."""
    return _build_sunburst()
