import os
import logging
import sys
from pathlib import Path
from fredapi import Fred

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src.core import config as settings

def fetch_global_macro_indicators() -> dict:
    """
    Aspire les dernieres donnees macroeconomiques via l'API officielle FRED.
    """
    # Dictionnaire des Series ID du FRED
    series_map = {
        'US_RATE': 'FEDFUNDS',             # US Federal Funds Effective Rate
        'US_GDP': 'A191RL1Q225SBEA',       # US Real GDP (QoQ Growth)
        'US_UNEMP': 'UNRATE',              # US Unemployment Rate
        'EU_RATE': 'IR3TIB01EZM156N',      # Euro Area 3-Month Interbank Rate
        'EU_GDP': 'CPMNACSCAB1GQEA',       # Euro Area Real GDP Growth
        'EU_UNEMP': 'LRHUTTTTEZM156S',     # Euro Area Unemployment Rate
        'JP_RATE': 'IR3TIB01JPM156N',      # Japan 3-Month Interbank Rate
        'JP_GDP': 'JPNRGDPEXP',            # Japan Real GDP Growth
        'JP_UNEMP': 'LRHUTTTTJPM156S'      # Japan Unemployment Rate
    }
    
    macro_data = {
        'US': {'Rate': 'N/A', 'GDP': 'N/A', 'Unemp': 'N/A'},
        'EU': {'Rate': 'N/A', 'GDP': 'N/A', 'Unemp': 'N/A'},
        'JP': {'Rate': 'N/A', 'GDP': 'N/A', 'Unemp': 'N/A'}
    }

    # Recuperation de la cle API depuis settings.py
    api_key = settings.fred_api_key
    
    if not api_key:
        logging.warning("FRED API KEY manquante. Retour des donnees vides.")
        return macro_data

    try:
        fred = Fred(api_key=api_key)
    except Exception as e:
        logging.error(f"SYSTEM FAULT: Echec initialisation client FRED - {e}")
        return macro_data
        
    def safe_fetch(series_id, is_gdp=False):
        try:
            s = fred.get_series(series_id).dropna()
            if s.empty: return None
            # Conversion automatique en % de croissance si la valeur est absolue (ex: EU/JP PIB)
            if is_gdp and abs(s.iloc[-1]) > 50:
                s = s.pct_change() * 100
                s = s.dropna()
            return s.iloc[-1] if not s.empty else None
        except Exception as e:
            logging.warning(f"FRED API: Impossible de recuperer {series_id} - {e}")
            return None

    for region in ['US', 'EU', 'JP']:
        rate_val = safe_fetch(series_map[f'{region}_RATE'])
        gdp_val = safe_fetch(series_map[f'{region}_GDP'], is_gdp=True)
        unemp_val = safe_fetch(series_map[f'{region}_UNEMP'])
        
        if rate_val is not None: macro_data[region]['Rate'] = f"{rate_val:.2f}%"
        if gdp_val is not None: macro_data[region]['GDP'] = f"{gdp_val:.2f}%"
        if unemp_val is not None: macro_data[region]['Unemp'] = f"{unemp_val:.1f}%"

    return macro_data