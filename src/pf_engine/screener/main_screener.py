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
from io import StringIO
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import requests
import yfinance as yf

_WIKI_UA = {"User-Agent": "Mozilla/5.0 (CapitalisTerminal/2.0)"}

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

def _fetch_wiki(url: str, symbol_cols: tuple[str, ...], suffix: str = "") -> list[str]:
    try:
        r = requests.get(url, headers=_WIKI_UA, timeout=15)
        r.raise_for_status()
        tables = pd.read_html(StringIO(r.text))
        for t in tables:
            for col in symbol_cols:
                if col in t.columns:
                    return [f"{str(x).replace('.', '-')}{suffix}" for x in t[col].dropna().tolist()]
        return []
    except Exception as exc:
        logger.warning("Wiki fetch failed %s: %s", url, exc)
        return []


def _fetch_sp500() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
                       ("Symbol",))


def _fetch_sp400() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/List_of_S%26P_400_companies",
                       ("Symbol", "Ticker symbol"))


def _fetch_sp600() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/List_of_S%26P_600_companies",
                       ("Symbol", "Ticker symbol"))


def _fetch_nasdaq100() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/Nasdaq-100", ("Ticker", "Symbol"))


def _fetch_dow30() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average",
                       ("Symbol",))


def _fetch_ftse100() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/FTSE_100_Index",
                       ("Ticker", "EPIC"), suffix=".L")


def _fetch_cac40() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/CAC_40", ("Ticker",))


def _fetch_dax() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/DAX", ("Ticker",))


def _fetch_eurostoxx50() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/EURO_STOXX_50", ("Ticker",))


def _fetch_nikkei225() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/Nikkei_225",
                       ("Code", "Ticker"), suffix=".T")


def _fetch_tsx60() -> list[str]:
    return _fetch_wiki("https://en.wikipedia.org/wiki/S%26P/TSX_60",
                       ("Symbol", "Ticker"), suffix=".TO")


_STATIC_FALLBACK = [
    # Mega-caps US
    "AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","TSLA","BRK-B","UNH","JPM","V","MA","XOM","JNJ",
    "WMT","PG","LLY","HD","MRK","COST","ABBV","KO","PEP","BAC","CVX","AVGO","ORCL","CSCO","TMO",
    "ACN","CRM","ADBE","NFLX","DHR","ABT","MCD","WFC","NKE","TXN","PM","UPS","INTC","NEE","DIS","BMY",
    "QCOM","AMD","HON","LIN","UNP","RTX","MS","GS","SCHW","BLK","BA","DE","CAT","IBM","SBUX","INTU",
    "AMGN","PFE","GE","C","T","VZ","CMCSA","NOW","ISRG","BKNG","SPGI","SYK","LMT","GILD","MDT","TJX",
    "ADI","REGN","CB","MO","ZTS","PYPL","BX","DUK","SO","ELV","CME","CVS","FI","MU","TMUS","ICE",
    "PNC","USB","SHW","BSX","COF","ADP","EQIX","ITW","WM","ETN","NOC","MMC","KLAC","FCX","APD","HUM",
    "AON","SLB","D","EOG","PSA","FDX","TGT","MAR","GM","F","HCA","EW","SRE","COP","ANET","LRCX",
    # ETFs
    "SPY","QQQ","IWM","DIA","VTI","VOO","VEA","VWO","BND","TLT","GLD","SLV","XLF","XLK","XLE","XLV",
    "XLI","XLP","XLY","XLU","XLB","XLRE","SMH","SOXX","ARKK","XBI","KRE","XHB","XOP","HYG","LQD",
    # Tech / growth
    "PLTR","SNOW","DDOG","NET","CRWD","ZS","SHOP","UBER","LYFT","COIN","HOOD","RBLX","ROKU","SQ",
    "ABNB","DASH","DOCU","ZM","TWLO","OKTA","MDB","WDAY","TEAM","HUBS","PANW","FTNT","SPLK","NTNX",
    # Mid-caps + sectors
    "AMAT","CDNS","SNPS","INTU","ADSK","CTSH","FIS","FISV","ROST","ORLY","AZO","DLTR","KMB","KR",
    "EL","CL","GIS","HSY","K","CPB","CAG","SJM","MKC","CHD","CLX","PEP","WBA","WBD","PARA","FOX",
    # Energy
    "OXY","PSX","HES","DVN","MPC","VLO","WMB","KMI","OKE","ET","EPD","TRGP","HAL","BKR","FANG",
    # Financials
    "AXP","TFC","BK","STT","MMC","AJG","TRV","MET","PRU","ALL","PGR","HIG","WRB","CINF","TROW",
    # Healthcare
    "VRTX","BIIB","MRNA","BNTX","ALNY","ILMN","IDXX","DXCM","HOLX","RMD","WAT","MTD","A","TFX",
    # Industrials
    "EMR","PH","CARR","OTIS","JCI","FAST","PCAR","CHRW","EXPD","ROK","DOV","XYL","CMI","WAB",
    # Consumer
    "LOW","BBY","DG","DLTR","ULTA","LULU","RH","TPR","CPRI","BBWI","DECK","CROX","HBI","GPS","ANF",
    # International ADRs
    "TSM","BABA","TM","NVO","SHEL","UL","SAP","RIO","BHP","HSBC","TD","RY","SONY","SAN",
    "BP","HMC","STLA","MUFG","NMR","IBN","INFY","WIT","HDB","TCEHY","JD","BIDU","PDD","NIO","XPEV",
    # International major (with suffix)
    "NESN.SW","NOVN.SW","ROG.SW","ASML.AS","MC.PA","OR.PA","RMS.PA","SAN.PA","BNP.PA","AIR.PA",
    "SHEL.L","HSBA.L","AZN.L","ULVR.L","BP.L","GSK.L","RIO.L","BARC.L","LLOY.L","BATS.L",
    "SAP.DE","SIE.DE","ALV.DE","BAS.DE","BAYN.DE","BMW.DE","DBK.DE","DTE.DE","MBG.DE","VOW3.DE",
    "7203.T","6758.T","9984.T","6861.T","8306.T","9432.T","7974.T","6098.T","4063.T","8035.T",
    "RY.TO","TD.TO","ENB.TO","CNQ.TO","SHOP.TO","BNS.TO","BMO.TO","CNR.TO","SU.TO","ABX.TO",
]


def _get_ticker_universe() -> list[str]:
    fetchers = [
        _fetch_sp500, _fetch_sp400, _fetch_sp600,
        _fetch_nasdaq100, _fetch_dow30,
        _fetch_ftse100, _fetch_cac40, _fetch_dax, _fetch_eurostoxx50,
        _fetch_nikkei225, _fetch_tsx60,
    ]
    all_t: list[str] = []
    for fn in fetchers:
        try:
            tickers = fn()
            logger.info("Universe: %s -> %d tickers", fn.__name__, len(tickers))
            all_t.extend(tickers)
        except Exception as exc:
            logger.warning("Universe fetcher %s failed: %s", fn.__name__, exc)
    if len(all_t) < 200:
        logger.warning("Universe: live fetch yielded %d (<200), merging static fallback", len(all_t))
        all_t.extend(_STATIC_FALLBACK)
    deduped = list(dict.fromkeys(t for t in all_t if t and isinstance(t, str)))
    logger.info("Universe: %d total unique tickers", len(deduped))
    return deduped


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


def _fetch_parallel(tickers: list[str], max_workers: int = 40) -> pd.DataFrame:
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
