import logging
import requests
import pandas as pd
from io import StringIO
from pathlib import Path

# Definition du chemin absolu vers le fichier de sauvegarde
ROOT = Path(__file__).resolve().parent.parent.parent
COT_CSV_PATH = ROOT / "data" / "cot_latest.csv"

def _standardize_cot_data(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty: return df
    try:
        col_asset = next((c for c in df.columns if 'WEEK' in str(c).upper()), df.columns[0])
        col_long = next((c for c in df.columns if 'LONG' in str(c).upper() and ('LARGE' in str(c).upper() or 'NON' in str(c).upper())), None)
        col_short = next((c for c in df.columns if 'SHORT' in str(c).upper() and ('LARGE' in str(c).upper() or 'NON' in str(c).upper())), None)
        
        if not col_long or not col_short:
            if len(df.columns) >= 11:
                col_long, col_short = df.columns[8], df.columns[10]
            else:
                return pd.DataFrame()
            
        df_clean = df[[col_asset, col_long, col_short]].copy()
        df_clean.columns = ['ASSET', 'NON_COMMERCIAL_LONG', 'NON_COMMERCIAL_SHORT']
        df_clean['ASSET'] = df_clean['ASSET'].astype(str).str.strip()
        
        mots_interdits = ['nan', 'none', '', 'indices', 'currencies', 'metals', 'energies', 'meats', 'grains']
        df_clean = df_clean[~df_clean['ASSET'].str.lower().isin(mots_interdits)]
        
        for col in ['NON_COMMERCIAL_LONG', 'NON_COMMERCIAL_SHORT']:
            df_clean[col] = pd.to_numeric(df_clean[col].astype(str).str.replace(',', '').str.replace(' ', ''), errors='coerce')
        
        df_clean.dropna(subset=['NON_COMMERCIAL_LONG', 'NON_COMMERCIAL_SHORT'], inplace=True)
        
        df_clean['NET_POSITION'] = df_clean['NON_COMMERCIAL_LONG'] - df_clean['NON_COMMERCIAL_SHORT']
        df_clean['SENTIMENT'] = df_clean['NET_POSITION'].apply(
            lambda x: 'Bullish (Achat)' if x > 0 else 'Bearish (Vente)' if x < 0 else 'Neutre'
        )
        return df_clean
    except Exception as e:
        logging.error(f"COT FATAL ERROR : {e}")
        return pd.DataFrame()

def fetch_and_save_cot_data() -> bool:
    """
    Extrait le COT et le sauvegarde dans un fichier CSV local. 
    Retourne True si succes, False sinon.
    """
    url = "https://insider-week.com/en/cot/"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    try:
        logging.info("SYSTEM: INITIATING COT DATA SCRAPING TO CSV...")
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        tables = pd.read_html(StringIO(response.text))
        if not tables: return False
        
        df = max(tables, key=len)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = ['_'.join(map(str, col)).strip() for col in df.columns.values]

        df_clean = _standardize_cot_data(df)
        
        if not df_clean.empty:
            COT_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
            df_clean.to_csv(COT_CSV_PATH, index=False)
            logging.info(f"COT DATA SAVED SUCCESSFULLY AT {COT_CSV_PATH}")
            return True

    except Exception as e:
        logging.error(f"SYSTEM FATAL ERROR: Echec inattendu du scraper COT - {e}")
        
    return False