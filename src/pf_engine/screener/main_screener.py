import sys
from pathlib import Path
import time
import logging
import warnings
import pandas as pd
import operator
from tvscreener import StockScreener, StockField

# Mise à jour du ROOT pour la nouvelle architecture
ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from src.core import config as settings

warnings.filterwarnings('ignore')

class Screener:
    def __init__(self, **kwargs):
        # --- MOTEUR DE DECOUVERTE DYNAMIQUE (ANTI-CRASH) ---
        def get_tv_field(*possible_api_names):
            """Cherche dynamiquement le champ dans l'Enum peu importe son nom de variable."""
            for f in StockField:
                if getattr(f, 'field_name', None) in possible_api_names:
                    return f
            return None

        # DICTIONNAIRE DE MAPPING DYNAMIQUE (Immunisé contre les versions pip)
        raw_map = {
            'trailingPE': get_tv_field('price_earnings_ttm', 'price_earnings'),
            'forwardPE': get_tv_field('price_earnings_forward_fy', 'price_earnings_forward'),
            'priceToBook': get_tv_field('price_book_ratio', 'price_book_fq'),
            'dividendYield': get_tv_field('dividends_yield', 'dividend_yield_recent'),
            'returnOnEquity': get_tv_field('return_on_equity_ttm', 'return_on_equity'),
            'debtToEquity': get_tv_field('debt_to_equity_ratio_mrq', 'debt_to_equity'),
            'profitMargins': get_tv_field('net_margin_ttm', 'after_tax_margin'),
            'currentRatio': get_tv_field('current_ratio_mrq', 'current_ratio'),
            'earningsGrowth': get_tv_field('eps_diluted_ttm_yoy_growth', 'earnings_per_share_diluted_yoy_growth_ttm'),
            'marketCap': get_tv_field('market_cap_basic', 'market_capitalization')
        }
        
        # Filtrage de sécurité : on ne garde que les champs que ta version de tvscreener connait vraiment
        self.tv_field_map = {k: v for k, v in raw_map.items() if v is not None}
        
        # MAPPING DES OPERATEURS LOGIQUES
        self.tv_op_map = {
            '>': operator.gt,
            '>=': operator.ge,
            '<': operator.lt,
            '<=': operator.le,
            '==': operator.eq
        }

    def run_screener(self, custom_rules=None, tickers_list=None, markets=['america']):
        logging.info("SYSTEM : INITIALISATION DU SCREENER COTE SERVEUR (TRADINGVIEW API).")
        
        screener = StockScreener()
        
        try:
            from tvscreener import Market
            market_map = {'america': Market.AMERICA}
            for market in markets:
                if market in market_map:
                    screener.set_markets(market_map[market])
        except ImportError:
            pass 
        
        # Si une liste de tickers est fournie, on filtre uniquement sur ces symboles et on ignore les autres regles.
        if tickers_list:
            from tvscreener import FilterOperation
            screener.filter(StockField.SYMBOL, FilterOperation.IN_RANGE, tickers_list)
            custom_rules = None  # On desactive les regles fondamentales si une liste de tickers est presente

        # --- SELECTION EXPLICITE DES COLONNES ---
        fields_to_select = list(self.tv_field_map.values())
        if hasattr(StockField, 'SECTOR'):
            fields_to_select.append(StockField.SECTOR)
        if hasattr(StockField, 'INDUSTRY'):
            fields_to_select.append(StockField.INDUSTRY)
            
        if hasattr(screener, 'select'):
            screener.select(*list(set(fields_to_select)))

        # 1. TRADUCTION ET APPLICATION DES FILTRES FONDAMENTAUX STRICTS
        if custom_rules: # Seulement si custom_rules est present et tickers_list non fourni
            for metric, crit in custom_rules.items():
                tv_field = self.tv_field_map.get(metric)
                if not tv_field:
                    logging.warning(f"SYSTEM WARNING : METRIQUE '{metric}' INCONNUE. IGNOREE POUR EVITER UN CRASH.")
                    continue
                    
                op_str = crit.get('op', '>=')
                val = crit.get('val', 0.0)
                
                op_func = self.tv_op_map.get(op_str)
                if op_func:
                    screener.where(op_func(tv_field, float(val)))
                    logging.info(f"SYSTEM : FILTRE API APPLIQUE -> {metric} {op_str} {val}")

        # 2. EXECUTION DE LA REQUETE MATRICIELLE
        logging.info("SYSTEM : FETCHING DATA FROM TRADINGVIEW SERVER...")
        try:
            df = screener.get()
        except Exception as e:
            logging.error(f"SYSTEM ERROR : ECHEC DE LA REQUETE TRADINGVIEW API -> {e}")
            return pd.DataFrame()
            
        if df is None or df.empty:
            logging.warning("SYSTEM WARNING : AUCUN ACTIF NE CORRESPOND AUX CRITERES SERVER-SIDE.")
            return pd.DataFrame()

        # 3. STANDARDISATION DES METADONNEES SECTORIELLES
        if df is not None and not df.empty:
            # Renommage standardisé pour la matrice d'allocation (1ere lettre en majuscule)
            col_mapping = {}
            for col in df.columns:
                if str(col).lower() == 'sector':
                    col_mapping[col] = 'Sector'
                if str(col).lower() == 'industry':
                    col_mapping[col] = 'Industry'
            df.rename(columns=col_mapping, inplace=True)
            
            # Securite anti-crash et formatage institutionnel des valeurs
            if 'Sector' not in df.columns:
                df['Sector'] = 'Inconnu'
            else:
                df['Sector'] = df['Sector'].astype(str).str.title()
                
            if 'Industry' not in df.columns:
                df['Industry'] = 'Inconnu'
            else:
                df['Industry'] = df['Industry'].astype(str).str.title()

        # 4. EXTRACTION ET NETTOYAGE DU TICKER PUR
        symbol_col = next((c for c in df.columns if str(c).lower() == 'symbol'), None)
        name_col = next((c for c in df.columns if str(c).lower() == 'name'), None)
        ticker_col = symbol_col or name_col

        if ticker_col:
            df['ticker'] = df[ticker_col].astype(str).apply(lambda x: x.split(':')[-1] if ':' in x else x)
        else:
            logging.warning("SYSTEM ERROR : COLONNE 'symbol' OU 'name' INTROUVABLE DANS LA REPONSE JSON.")
            return pd.DataFrame()

        logging.info(f"SYSTEM : SCREENING COMPLETE. {len(df)} ACTIFS QUALIFIES.")
        if not df.empty:
            
            # --- PERSISTANCE SQLITE ---
            try:
                from src.data_managers.db_manager import DatabaseManager
                db = DatabaseManager()
                
                df_assets = pd.DataFrame({
                    'ticker': df['ticker'],
                    'name': df.get('name', df.get('description', 'Unknown')),
                    'sector': df.get('Sector', 'Unknown'),
                    'industry': df.get('Industry', 'Unknown'),
                    'is_active': 1
                })
                db.upsert_assets(df_assets)
            except Exception as e:
                logging.error(f"SYSTEM ERROR : Impossible de sauvegarder dans la base SQLite -> {e}")
                
        return df