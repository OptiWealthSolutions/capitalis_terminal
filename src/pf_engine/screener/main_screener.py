"""
Equity screener — pure yfinance implementation.
Universe: S&P 500 + NASDAQ-100, cached 24h in parquet.
No tvscreener dependency.
"""
import json
import logging
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from src.core import config as settings

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

_DATA_DIR         = ROOT / "data"
_UNIVERSE_PARQUET = _DATA_DIR / "yf_universe.parquet"
_UNIVERSE_META    = _DATA_DIR / "yf_universe_meta.json"
_UNIVERSE_TTL     = 86_400  # 24 hours

_FIELDS = [
    "symbol", "longName", "shortName", "sector", "industry", "country",
    "currentPrice", "previousClose", "marketCap",
    "trailingPE", "forwardPE", "priceToBook",
    "priceToSalesTrailing12Months", "enterpriseToEbitda", "pegRatio",
    "returnOnEquity", "returnOnAssets", "grossMargins",
    "operatingMargins", "profitMargins", "ebitdaMargins",
    "currentRatio", "quickRatio", "debtToEquity",
    "dividendYield", "earningsGrowth", "revenueGrowth",
    "beta", "fiftyTwoWeekLow", "fiftyTwoWeekHigh",
    "fiftyDayAverage", "twoHundredDayAverage",
    "volume", "averageVolume",
]


# ---------------------------------------------------------------------------
# Universe helpers
# ---------------------------------------------------------------------------

def _fetch_sp500() -> list[str]:
    try:
        df = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
        return [str(t).replace(".", "-") for t in df["Symbol"].tolist()]
    except Exception as exc:
        logger.warning("SP500 fetch failed: %s", exc)
        return []


def _fetch_nasdaq100() -> list[str]:
    try:
        tables = pd.read_html("https://en.wikipedia.org/wiki/Nasdaq-100")
        for t in tables:
            if "Ticker" in t.columns:
                return [str(x) for x in t["Ticker"].tolist()]
        return []
    except Exception as exc:
        logger.warning("NASDAQ100 fetch failed: %s", exc)
        return []


def _get_ticker_universe() -> list[str]:
    sp = _fetch_sp500()
    nd = _fetch_nasdaq100()
    return list(dict.fromkeys(sp + nd))


def _universe_is_fresh() -> bool:
    if not _UNIVERSE_META.exists():
        return False
    try:
        meta = json.loads(_UNIVERSE_META.read_text())
        return (time.time() - meta.get("ts", 0)) < _UNIVERSE_TTL
    except Exception:
        return False


def _load_universe_cache() -> pd.DataFrame | None:
    if _UNIVERSE_PARQUET.exists():
        try:
            return pd.read_parquet(_UNIVERSE_PARQUET)
        except Exception:
            return None
    return None


def _save_universe_cache(df: pd.DataFrame) -> None:
    _DATA_DIR.mkdir(exist_ok=True)
    try:
        df.to_parquet(_UNIVERSE_PARQUET, index=False)
        _UNIVERSE_META.write_text(json.dumps({"ts": time.time(), "count": len(df)}))
    except Exception as exc:
        logger.warning("Universe save failed: %s", exc)


# ---------------------------------------------------------------------------
# Per-ticker fetcher
# ---------------------------------------------------------------------------

def _fetch_one(ticker: str) -> dict | None:
    try:
        info = yf.Ticker(ticker).info
        if not info or info.get("marketCap") is None:
            return None
        return {k: info.get(k) for k in _FIELDS}
    except Exception:
        return None


def _fetch_parallel(tickers: list[str], max_workers: int = 20) -> pd.DataFrame:
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_one, t): t for t in tickers}
        for fut in as_completed(futures):
            r = fut.result()
            if r:
                results.append(r)
    return pd.DataFrame(results) if results else pd.DataFrame()


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

_EXCH_RE = r"\.(PA|L|DE|AS|TO|AX|SW|MC|MI|ST|CO|OL|HE|VI|WA|F|SA|HK|NS|BO|SI|TW|MX|BK|NZ|JK|IS|BR|SN|KL|JO)$"


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    # Ticker column
    if "Ticker" not in df.columns:
        if "symbol" in df.columns:
            df = df.rename(columns={"symbol": "Ticker"})
        else:
            df["Ticker"] = "UNKNOWN"
    df["Ticker"] = (
        df["Ticker"].astype(str).str.upper()
        .str.replace(_EXCH_RE, "", regex=True)
    )
    df = df[~df["Ticker"].str.contains("/", regex=False, na=False)].copy()

    # Company name
    if "Name" not in df.columns:
        if "longName" in df.columns:
            short = df.get("shortName", pd.Series(df["Ticker"]))
            df["Name"] = df["longName"].fillna(short).fillna(df["Ticker"])
        else:
            df["Name"] = df["Ticker"]

    # Sector / Industry
    for src, dst in [("sector", "Sector"), ("industry", "Industry")]:
        if dst not in df.columns and src in df.columns:
            df = df.rename(columns={src: dst})
    for col in ("Sector", "Industry"):
        if col not in df.columns:
            df[col] = "Unknown"
        else:
            df[col] = (
                df[col].fillna("Unknown").astype(str)
                .str.title()
                .replace({"None": "Unknown", "Nan": "Unknown"})
            )

    df = df.reset_index(drop=True)
    return df.replace([np.inf, -np.inf], np.nan).where(pd.notna(df), None)


# ---------------------------------------------------------------------------
# Screener class (interface preserved for router compatibility)
# ---------------------------------------------------------------------------

class Screener:
    _OPS = {
        ">":  lambda s, v: s > v,
        ">=": lambda s, v: s >= v,
        "<":  lambda s, v: s < v,
        "<=": lambda s, v: s <= v,
        "==": lambda s, v: s == v,
    }

    def __init__(self, **_kwargs):
        pass

    def run_screener(
        self,
        custom_rules: dict | None = None,
        tickers_list: list[str] | None = None,
        markets: list[str] | None = None,
    ) -> pd.DataFrame:
        logger.info("SCREENER: starting yfinance screen")

        if tickers_list:
            df = _fetch_parallel(tickers_list, max_workers=min(10, len(tickers_list)))
        else:
            df = self._get_or_build_universe()

        if df is None or df.empty:
            logger.warning("SCREENER: no data available")
            return pd.DataFrame()

        df = _normalize(df)
        if df.empty:
            return df

        if custom_rules:
            df = self._apply_filters(df, custom_rules)

        self._persist(df)
        logger.info("SCREENER: %d assets qualified", len(df))
        return df

    def _get_or_build_universe(self) -> pd.DataFrame:
        if _universe_is_fresh():
            cached = _load_universe_cache()
            if cached is not None and not cached.empty:
                logger.info("SCREENER: cached universe (%d tickers)", len(cached))
                return cached

        logger.info("SCREENER: building fresh universe from yfinance (this takes ~15s)")
        tickers = _get_ticker_universe()
        if not tickers:
            logger.error("SCREENER: could not fetch ticker universe, trying CSV fallback")
            return self._fallback_csv_screen()

        df = _fetch_parallel(tickers)
        if not df.empty:
            _save_universe_cache(df)
        return df

    def _apply_filters(self, df: pd.DataFrame, rules: dict) -> pd.DataFrame:
        for metric, crit in rules.items():
            if metric not in df.columns:
                logger.warning("SCREENER: metric '%s' not in data, skipping", metric)
                continue
            try:
                val    = float(crit.get("val", 0))
                col    = pd.to_numeric(df[metric], errors="coerce")
                op_fn  = self._OPS.get(crit.get("op", ">="))
                if op_fn:
                    df = df[op_fn(col, val).fillna(False)]
            except Exception as exc:
                logger.warning("SCREENER: filter error '%s': %s", metric, exc)
        return df

    def _persist(self, df: pd.DataFrame) -> None:
        try:
            from src.data_managers.db_manager import DatabaseManager
            db = DatabaseManager()
            ticker_s  = df["Ticker"]   if "Ticker"   in df.columns else pd.Series(["UNKNOWN"] * len(df))
            name_s    = df["Name"]     if "Name"     in df.columns else pd.Series(["Unknown"] * len(df))
            sector_s  = df["Sector"]   if "Sector"   in df.columns else pd.Series(["Unknown"] * len(df))
            industry_s = df["Industry"] if "Industry" in df.columns else pd.Series(["Unknown"] * len(df))
            db.upsert_assets(pd.DataFrame({
                "ticker":    ticker_s,
                "name":      name_s,
                "sector":    sector_s,
                "industry":  industry_s,
                "is_active": 1,
            }))
        except Exception as exc:
            logger.error("SCREENER: SQLite persist failed → %s", exc)

    def _fallback_csv_screen(self, custom_rules: dict | None = None) -> pd.DataFrame:
        try:
            df = pd.read_csv(settings.FINAL_SCORED_PATH)
        except Exception as exc:
            logger.error("SCREENER fallback: cannot read CSV → %s", exc)
            return pd.DataFrame()

        if "Name" not in df.columns:
            if "name" in df.columns:
                df["Name"] = df["name"]
            elif "ticker" in df.columns:
                df["Name"] = df["ticker"]

        if custom_rules:
            df = self._apply_filters(df, custom_rules)

        return df.replace([np.inf, -np.inf], np.nan).where(pd.notna(df), None)
