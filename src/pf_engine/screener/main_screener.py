import sys
from pathlib import Path
import logging
import warnings
import pandas as pd
import operator
from tvscreener import StockScreener, StockField

# TradingView returns display-name columns (e.g. "Current Ratio (MRQ)").
# The dynamic col_rename built from StockField.value uses API names that never match.
# This static map covers all metrics the screener and scorer need.
_TV_DISPLAY_RENAME: dict[str, str] = {
    "Price":                             "currentPrice",
    "Price to Earnings Ratio (TTM)":     "trailingPE",
    "Forward P/E (Non-GAAP)":            "forwardPE",
    "Price to Book (MRQ)":               "priceToBook",
    "Price to Book (FY)":                "priceToBook",
    "Dividend Yield %":                  "dividendYield",
    "Dividend Yield Forward":            "dividendYield",
    "Return on Equity (TTM)":            "returnOnEquity",
    "Debt to Equity Ratio (MRQ)":        "debtToEquity",
    "Net Margin (TTM)":                  "profitMargins",
    "Net Margin (FY)":                   "profitMargins",
    "Operating Margin (TTM)":            "operatingMargins",
    "Current Ratio (MRQ)":               "currentRatio",
    "EPS Diluted (Annual YoY Growth)":   "earningsGrowth",
    "EPS Diluted (TTM YoY Growth)":      "earningsGrowth",
    "Revenue (Annual YoY Growth)":       "revenueGrowth",
    "Revenue (TTM YoY Growth)":          "revenueGrowth",
    "Price Earnings Forward FY":         "forwardPE",
    "Market Capitalization":             "marketCap",
    "Gross Profit Margin (TTM)":         "grossMargins",
}

ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from src.core import config as settings

warnings.filterwarnings('ignore')


class Screener:
    def __init__(self, **kwargs):

        def get_tv_field(*possible_api_names: str):
            """Find a StockField by API name (index 1 of the tuple value)."""
            for f in StockField:
                v = getattr(f, 'value', None)
                api_name = v[1] if isinstance(v, tuple) and len(v) > 1 else str(v)
                if api_name in possible_api_names:
                    return f
            return None

        # Mapping: our standard name → StockField
        raw_map = {
            'currentPrice':    get_tv_field('close'),
            'trailingPE':      get_tv_field('price_earnings_ttm', 'price_earnings'),
            'forwardPE':       get_tv_field('price_earnings_forward_fy', 'price_earnings_forward', 'price_earnings_current'),
            'priceToBook':     get_tv_field('price_book_ratio', 'price_book_fq'),
            'dividendYield':   get_tv_field('dividends_yield', 'dividend_yield_recent', 'dividends_yield_current'),
            'returnOnEquity':  get_tv_field('return_on_equity', 'return_on_equity_ttm', 'return_on_equity_fq'),
            'debtToEquity':    get_tv_field('debt_to_equity', 'debt_to_equity_ratio_mrq', 'debt_to_equity_fq'),
            'profitMargins':   get_tv_field('net_margin', 'net_margin_ttm', 'net_income_bef_disc_oper_margin_fy'),
            'operatingMargins': get_tv_field('operating_margin', 'oper_income_per_revenue', 'gross_profit_margin'),
            'currentRatio':    get_tv_field('current_ratio', 'current_ratio_mrq', 'current_ratio_fq'),
            'earningsGrowth':  get_tv_field('earnings_per_share_diluted_yoy_growth_ttm', 'eps_diluted_ttm_yoy_growth'),
            'revenueGrowth':   get_tv_field('total_revenue_yoy_growth_ttm', 'revenue_yoy_growth_ttm'),
            'marketCap':       get_tv_field('market_cap_basic', 'market_capitalization', 'market_cap_calc'),
        }

        # Keep only fields the installed version actually knows
        self.tv_field_map: dict = {k: v for k, v in raw_map.items() if v is not None}

        # Reverse map: API name → our standard name (used after screener.get())
        self.col_rename: dict = {}
        for our_name, tv_field in self.tv_field_map.items():
            v = getattr(tv_field, 'value', None)
            api_name = v[1] if isinstance(v, tuple) and len(v) > 1 else str(v)
            if api_name:
                self.col_rename[api_name] = our_name

        self.tv_op_map = {
            '>': operator.gt,
            '>=': operator.ge,
            '<': operator.lt,
            '<=': operator.le,
            '==': operator.eq,
        }

    def run_screener(self, custom_rules=None, tickers_list=None, markets=None):
        if markets is None:
            markets = ['america']

        logging.info("SCREENER: initializing TradingView StockScreener")
        screener = StockScreener()

        try:
            from tvscreener import Market
            market_map = {'america': Market.AMERICA}
            for market in markets:
                if market in market_map:
                    screener.set_markets(market_map[market])
        except ImportError:
            pass

        if tickers_list:
            try:
                from tvscreener import FilterOperation
                screener.filter(StockField.SYMBOL, FilterOperation.IN_RANGE, tickers_list)
                custom_rules = None
            except Exception as e:
                logging.warning(f"SCREENER: ticker filter failed: {e}")

        # Select fields explicitly
        fields_to_select = list(self.tv_field_map.values())
        extra_fields = []
        for attr in ('SECTOR', 'INDUSTRY'):
            if hasattr(StockField, attr):
                extra_fields.append(getattr(StockField, attr))
        if hasattr(screener, 'select') and fields_to_select:
            screener.select(*list(dict.fromkeys(fields_to_select + extra_fields)))

        # Apply fundamental filters
        if custom_rules:
            for metric, crit in custom_rules.items():
                tv_field = self.tv_field_map.get(metric)
                if not tv_field:
                    logging.warning(f"SCREENER: unknown metric '{metric}', skipped")
                    continue
                op_str = crit.get('op', '>=')
                val = float(crit.get('val', 0.0))
                op_func = self.tv_op_map.get(op_str)
                if op_func:
                    try:
                        screener.where(op_func(tv_field, val))
                        logging.info(f"SCREENER: filter applied → {metric} {op_str} {val}")
                    except Exception as e:
                        logging.warning(f"SCREENER: filter error for {metric}: {e}")

        # Execute query
        logging.info("SCREENER: executing TradingView API request…")
        try:
            df = screener.get()
        except Exception as e:
            logging.error(f"SCREENER: TradingView API request failed → {e}. Using CSV fallback.")
            return self._fallback_csv_screen(custom_rules)

        if df is None or df.empty:
            logging.warning("SCREENER: TradingView returned no results. Using CSV fallback.")
            return self._fallback_csv_screen(custom_rules)

        # ---- Rename tvscreener column names → our standard names ----
        # Apply static display-name map first (covers most cases).
        # Fall back to dynamic API-name map for any edge cases.
        df = df.rename(columns=_TV_DISPLAY_RENAME)
        df = df.rename(columns=self.col_rename)
        # Drop duplicate columns produced when multiple TV display names map to
        # the same standard name (e.g. "Dividend Yield %" and "Dividend Yield Forward").
        df = df.loc[:, ~df.columns.duplicated(keep="first")]

        # ---- Normalize tvscreener percent→decimal (yfinance convention) ----
        # tvscreener returns these as raw percent (NVDA ROE = 101.485 not 1.01485).
        # Frontend criteria use yfinance decimal (ROE >= 0.30 means 30%).
        _TV_PCT_COLS = {
            'returnOnEquity', 'returnOnAssets', 'earningsGrowth', 'revenueGrowth',
            'dividendYield', 'operatingMargins', 'profitMargins', 'grossMargins',
        }
        for _col in _TV_PCT_COLS:
            if _col in df.columns:
                df[_col] = pd.to_numeric(df[_col], errors='coerce') / 100.0

        # ---- Post-filter: apply criteria in Python ----
        # tvscreener's .where() filter may fail silently; enforce here regardless.
        if custom_rules:
            for metric, crit in custom_rules.items():
                if metric not in df.columns:
                    continue
                try:
                    val = float(crit.get('val', 0))
                    col = pd.to_numeric(df[metric], errors='coerce')
                    op_str = crit.get('op', '>=')
                    if op_str == '>=':   mask = col >= val
                    elif op_str == '<=': mask = col <= val
                    elif op_str == '>':  mask = col > val
                    elif op_str == '<':  mask = col < val
                    elif op_str == '==': mask = col == val
                    else: continue
                    df = df[mask.fillna(False)]
                except Exception as e:
                    logging.warning(f"SCREENER post-filter error for {metric}: {e}")

        # ---- Sector / Industry standardisation ----
        for raw, std in [('sector', 'Sector'), ('industry', 'Industry')]:
            for col in df.columns:
                if col.lower() == raw and col != std:
                    df = df.rename(columns={col: std})
        if 'Sector' not in df.columns:
            df['Sector'] = 'Unknown'
        else:
            df['Sector'] = df['Sector'].astype(str).str.title().replace('nan', 'Unknown')
        if 'Industry' not in df.columns:
            df['Industry'] = 'Unknown'
        else:
            df['Industry'] = df['Industry'].astype(str).str.title().replace('nan', 'Unknown')

        # ---- Extract clean ticker ----
        symbol_col = next((c for c in df.columns if str(c).lower() == 'symbol'), None)
        name_col   = next((c for c in df.columns if str(c).lower() == 'name'), None)
        ticker_src = symbol_col or name_col

        if ticker_src is None:
            logging.error("SCREENER: no 'symbol' or 'name' column found in response")
            return pd.DataFrame()

        df['Ticker'] = df[ticker_src].astype(str).apply(
            lambda x: x.split(':')[-1] if ':' in x else x
        )

        # Preserve company name in output
        name_col_found = next((c for c in df.columns if str(c).lower() in ('name', 'description', 'company')), None)
        if name_col_found and name_col_found != ticker_src:
            df['Name'] = df[name_col_found].astype(str).replace('nan', '').replace('None', '')
        elif name_col_found == ticker_src:
            df['Name'] = df['Ticker']
        else:
            df['Name'] = df['Ticker']

        # ---- Persist to SQLite ----
        try:
            from src.data_managers.db_manager import DatabaseManager
            db = DatabaseManager()
            name_src = df.get('name', df.get('description', pd.Series(['Unknown'] * len(df))))
            df_assets = pd.DataFrame({
                'ticker':    df['Ticker'],
                'name':      name_src if isinstance(name_src, pd.Series) else 'Unknown',
                'sector':    df['Sector'],
                'industry':  df['Industry'],
                'is_active': 1,
            })
            db.upsert_assets(df_assets)
        except Exception as e:
            logging.error(f"SCREENER: SQLite persist failed → {e}")

        logging.info(f"SCREENER: complete — {len(df)} assets qualified")

        import numpy as np
        df = df.replace([np.inf, -np.inf], np.nan).where(pd.notna(df), None)
        return df

    # equity_scored.csv stores these in PERCENT units (e.g. 1.17 = 1.17%)
    # while the frontend sends criteria in yfinance DECIMAL units (e.g. 0.03 = 3%).
    _CSV_PERCENT_METRICS: frozenset = frozenset({'dividendYield'})

    def _fallback_csv_screen(self, custom_rules: dict | None = None) -> pd.DataFrame:
        """Pandas fallback: filter equity_scored.csv when TradingView API is unavailable."""
        import numpy as np
        try:
            df = pd.read_csv(settings.FINAL_SCORED_PATH)
        except Exception as e:
            logging.error(f"SCREENER fallback: cannot read equity_scored.csv → {e}")
            return pd.DataFrame()

        if 'Name' not in df.columns and 'name' in df.columns:
            df['Name'] = df['name']
        elif 'Name' not in df.columns:
            df['Name'] = df.get('ticker', df.get('Ticker', ''))

        if custom_rules:
            for metric, crit in custom_rules.items():
                if metric not in df.columns:
                    logging.warning(f"SCREENER fallback: metric '{metric}' not in CSV, skipped")
                    continue
                try:
                    val = float(crit.get('val', 0))
                    # Convert decimal criteria → percent for metrics stored as percent in CSV
                    if metric in self._CSV_PERCENT_METRICS:
                        val = val * 100.0
                    col = pd.to_numeric(df[metric], errors='coerce')
                    op_str = crit.get('op', '>=')
                    if op_str == '>=':   mask = col >= val
                    elif op_str == '<=': mask = col <= val
                    elif op_str == '>':  mask = col > val
                    elif op_str == '<':  mask = col < val
                    elif op_str == '==': mask = col == val
                    else: continue
                    df = df[mask.fillna(False)]
                except Exception as e:
                    logging.warning(f"SCREENER fallback: filter error for '{metric}': {e}")

        if 'Ticker' not in df.columns:
            if 'Symbol' in df.columns:
                df['Ticker'] = df['Symbol'].astype(str).apply(
                    lambda x: x.split(':')[-1] if ':' in x else x
                )
        if 'Sector' not in df.columns and 'sector' in df.columns:
            df = df.rename(columns={'sector': 'Sector'})
        if 'Sector' not in df.columns:
            df['Sector'] = 'Unknown'

        # Normalize CSV percent-form columns to decimal convention for frontend display.
        # CSV stores dividendYield as percent (1.17 = 1.17%); frontend expects decimal (0.0117).
        for _col in self._CSV_PERCENT_METRICS:
            if _col in df.columns:
                df[_col] = pd.to_numeric(df[_col], errors='coerce') / 100.0

        df = df.replace([np.inf, -np.inf], np.nan).where(pd.notna(df), None)
        logging.info(f"SCREENER fallback: {len(df)} assets matched from CSV universe")
        return df
