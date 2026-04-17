import os
import logging
import sys
from pathlib import Path
from fredapi import Fred

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src.core import config as settings


# FRED series IDs per region
_SERIES: dict[str, dict[str, str]] = {
    'US': {
        'rate':  'FEDFUNDS',           # Federal Funds Effective Rate
        'gdp':   'A191RL1Q225SBEA',    # US Real GDP QoQ growth
        'unemp': 'UNRATE',             # US Unemployment Rate
    },
    'EU': {
        'rate':  'IR3TIB01EZM156N',    # Euro Area 3-Month Interbank
        'gdp':   'CPMNACSCAB1GQEA',    # Euro Area Real GDP
        'unemp': 'LRHUTTTTEZM156S',    # Euro Area Unemployment
    },
    'JP': {
        'rate':  'IR3TIB01JPM156N',    # Japan 3-Month Interbank
        'gdp':   'JPNRGDPEXP',         # Japan Real GDP Growth
        'unemp': 'LRHUTTTTJPM156S',    # Japan Unemployment
    },
    'CN': {
        'rate':  'IRSTCB01CNM156N',    # China 3-Month Interbank
        'gdp':   'CHNGDPNQDSMEI',      # China GDP (OECD MEI)
        'unemp': 'LRHUTTTTCNM156S',    # China Unemployment (ILO harmonized)
    },
    'GB': {
        'rate':  'IR3TIB01GBM156N',    # UK 3-Month Interbank Rate
        'gdp':   'NAEXKP01GBQ657S',    # UK Real GDP QoQ growth (OECD MEI)
        'unemp': 'LRHUTTTTGBM156S',    # UK Unemployment
    },
    'CA': {
        'rate':  'IRSTCB01CAM156N',    # Canada Overnight Rate
        'gdp':   'NAEXKP01CAQ657S',    # Canada Real GDP QoQ growth (OECD MEI)
        'unemp': 'LRHUTTTTCAM156S',    # Canada Unemployment
    },
}


def fetch_global_macro_indicators() -> dict:
    """
    Fetches latest macro data via FRED API for US, EU, JP, CN, GB, CA.
    Returns a dict { region: { Rate, GDP, Unemp } }.
    Gracefully degrades to 'N/A' if a series is unavailable.
    """
    result: dict[str, dict[str, str]] = {
        r: {'Rate': 'N/A', 'GDP': 'N/A', 'Unemp': 'N/A'} for r in _SERIES
    }

    api_key = settings.fred_api_key
    if not api_key:
        logging.warning("FRED API KEY missing — returning empty macro indicators.")
        return result

    try:
        fred = Fred(api_key=api_key)
    except Exception as e:
        logging.error(f"FRED client init failed: {e}")
        return result

    def safe_fetch(series_id: str, is_pct_level: bool = False) -> float | None:
        """Fetch latest value from FRED; optionally convert absolute level to pct change."""
        try:
            s = fred.get_series(series_id).dropna()
            if s.empty:
                return None
            if is_pct_level and abs(s.iloc[-1]) > 50:
                s = s.pct_change() * 100
                s = s.dropna()
            return float(s.iloc[-1]) if not s.empty else None
        except Exception as e:
            logging.warning(f"FRED fetch failed for {series_id}: {e}")
            return None

    for region, series in _SERIES.items():
        rate_val  = safe_fetch(series['rate'])
        gdp_val   = safe_fetch(series['gdp'], is_pct_level=True)
        unemp_val = safe_fetch(series['unemp'])

        if rate_val  is not None: result[region]['Rate']  = f"{rate_val:.2f}%"
        if gdp_val   is not None: result[region]['GDP']   = f"{gdp_val:.2f}%"
        if unemp_val is not None: result[region]['Unemp'] = f"{unemp_val:.1f}%"

    return result
