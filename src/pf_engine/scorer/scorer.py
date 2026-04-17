import logging
import pandas as pd
import numpy as np
import yfinance as yf
from scipy.stats import zscore
import sys
import concurrent.futures
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from src.core import config as settings
class Scorer:
    def get_risk_free_rate(self):
        try:
            import yfinance as yf
            treasury = yf.Ticker("^TNX")
            rate = treasury.history(period="5d")["Close"].dropna().iloc[-1] / 100
            logging.info(f"Taux sans risque (TNX 10 ans) : {rate:.4f}")
            return max(rate, 0.02)
        except Exception as e:
            logging.warning(f"Impossible de récupérer le taux sans risque, utilisation d'une valeur par défaut (4%). Erreur: {e}")
            return 0.04 # Valeur par défaut plus réaliste

    def __init__(self, df_input=None, custom_weights=None):
        if df_input is None:
            try:
                logging.info(f"Lecture des actifs depuis {settings.SCREENED_ASSETS_PATH}")
                self.df = pd.read_csv(settings.SCREENED_ASSETS_PATH)
            except FileNotFoundError:
                logging.error("Fichier screened_assets introuvable. Lancez le screener en premier.")
                raise
        else:
            self.df = df_input

        if self.df.empty:
            raise ValueError("Le DataFrame en entrée du scorer est vide. Fin du processus.")
        
        self.custom_weights = custom_weights

    def ComputeScore(self):
        rf_rate = self.get_risk_free_rate()
        df = self.df.copy()
        
        def clean_ticker(t):
            if not isinstance(t, str):
                return t
            t = str(t).upper()
            if ':' in t:
                t = t.split(':')[-1]
            if t in settings.SPECIAL_TICKER_MAP:
                return settings.SPECIAL_TICKER_MAP[t]
            if '/' in t:
                return t.replace('/', '-')
            if t == 'BRK.A': return 'BRK-A'
            if t == 'BRK.B': return 'BRK-B'
            if t == 'BF.A': return 'BF-A'
            if t == 'BF.B': return 'BF-B'
            t = t.replace('.', '-')
            return t.strip()
            
        # Identification dynamique de la colonne du ticker (symbol, Ticker, ou ticker en cas de fallback)
        ticker_col = next((c for c in ['symbol', 'Ticker', 'ticker'] if c in df.columns), None)
        if ticker_col is not None:
            df['yf_symbol'] = df[ticker_col].astype(str).apply(clean_ticker)
        else:
            raise KeyError("SYSTEM FAULT: Aucune colonne de Ticker ('symbol' ou 'Ticker') n'a ete trouvee dans le DataFrame d'entree.")

        yf_tickers = df['yf_symbol'].tolist()
        
        perf_data = []
        hist = yf.download(yf_tickers, period=settings.LOOK_BACK_PERIOD, interval="1d", progress=False)
        
        for idx, row in df.iterrows():
            t_orig = row[ticker_col]
            t_yf = row['yf_symbol']
            try:
                if len(yf_tickers) == 1:
                    data = hist['Close'].dropna()
                else:
                    data = hist['Close'][t_yf].dropna()
                    
                if len(data) < 252:
                    raise ValueError("Historique de prix trop court (moins d'un an)")

                years = len(data) / 252
                cagr = (data.iloc[-1] / data.iloc[0])**(1/years) - 1

                # Log-returns : cohérents avec Monte Carlo (hypothèse log-normale) et GARCH
                log_returns = np.log(data / data.shift(1)).dropna()
                vol = log_returns.std() * np.sqrt(252)
                sharpe = (cagr - rf_rate) / vol if vol > 0 else 0
                daily_return = float(log_returns.iloc[-1]) if not log_returns.empty else 0

                # Sortino Ratio — pénalise uniquement la volatilité baissière
                downside = log_returns[log_returns < 0]
                downside_dev = np.sqrt((downside**2).mean()) * np.sqrt(252) if len(downside) > 5 else np.nan
                sortino = (cagr - rf_rate) / downside_dev if (downside_dev and downside_dev > 0) else 0

                # Maximum Drawdown — pire recul depuis un sommet historique (valeur négative)
                wealth = (1 + log_returns).cumprod()
                rolling_max = wealth.cummax()
                mdd = float(((wealth - rolling_max) / rolling_max).min())

                # Average Daily Value sur 30j (Volume × Prix) — proxy de liquidité, en M€/$
                try:
                    vol_series = (
                        hist['Volume'][t_yf] if len(yf_tickers) > 1 else hist['Volume']
                    ).dropna()
                    avg_adv = float(data.iloc[-30:].mean() * vol_series.iloc[-30:].mean() / 1e6)
                except Exception:
                    avg_adv = np.nan

                perf_data.append({
                    ticker_col: t_orig,
                    'CAGR': cagr, 'Vol_Ann': vol, 'Sharpe': sharpe,
                    'Sortino': sortino, 'MDD': mdd, 'Avg_ADV_M': avg_adv,
                    'Close': data.iloc[-1], 'daily_return_pct': daily_return
                })
            except Exception as e:
                logging.warning(f"Impossible de calculer la performance pour {t_yf}: {e}. Le ticker sera noté avec des valeurs par défaut.")
                perf_data.append({
                    ticker_col: t_orig,
                    'CAGR': 0, 'Vol_Ann': 1, 'Sharpe': -1,
                    'Sortino': 0, 'MDD': np.nan, 'Avg_ADV_M': np.nan,
                    'Close': np.nan, 'daily_return_pct': 0
                })

        df_perf = pd.DataFrame(perf_data)
        df = pd.merge(df, df_perf, on=ticker_col, how='left')

        logging.info(f"Récupération des ratios fondamentaux manquants pour {len(yf_tickers)} actifs (via multithreading)...")
        
        def fetch_fundamental_info(t_tuple):
            t_orig, t_yf = t_tuple
            try:
                info = yf.Ticker(t_yf).info
                
                d_e = info.get('debtToEquity', np.nan)
                if d_e is not None and not np.isnan(d_e):
                    d_e = d_e / 100.0

                div_yield = info.get('dividendYield')
                if div_yield is None: div_yield = 0

                return {
                    ticker_col: t_orig,
                    'Name': info.get('longName', info.get('shortName', t_orig)),
                    'Sector': info.get('sector', 'Inconnu'),
                    'Country': info.get('country', 'Inconnu'),
                    'trailingPE': info.get('trailingPE', np.nan),
                    'forwardPE': info.get('forwardPE', np.nan),
                    'priceToBook': info.get('priceToBook', np.nan),
                    'debtToEquity': d_e,
                    'trailingEps': info.get('trailingEps', np.nan),
                    'dividendYield': div_yield,
                    'returnOnEquity': info.get('returnOnEquity', np.nan),
                    'returnOnAssets': info.get('returnOnAssets', np.nan),
                    'earningsGrowth': info.get('earningsGrowth', np.nan),
                    'operatingMargins': info.get('operatingMargins', np.nan),
                    'currentRatio': info.get('currentRatio', np.nan)
                }
            except Exception as e:
                logging.warning(f"Erreur info fondamentale pour {t_yf}: {e}")
                return None

        fund_data = []
        ticker_tuples = list(zip(df[ticker_col], df['yf_symbol']))
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            results = executor.map(fetch_fundamental_info, ticker_tuples)
            
        for res in results:
            if res is not None:
                fund_data.append(res)
        
        if fund_data:
            df_fund = pd.DataFrame(fund_data)

            # Suppression des métadonnées redondantes pour éviter la création de suffixes (_x, _y) lors de la fusion
            overlap_cols = [c for c in ['Name', 'Sector', 'Country'] if c in df.columns and c in df_fund.columns]
            if overlap_cols:
                df_fund = df_fund.drop(columns=overlap_cols)

            df = pd.merge(df, df_fund, on=ticker_col, how='left')

            # Résoudre les suffixes _x/_y pour les colonnes fondamentales :
            # préférer la valeur _y (données fraîches yfinance) sur la valeur _x (screener)
            fund_cols = [
                'trailingPE', 'priceToBook', 'returnOnEquity', 'earningsGrowth',
                'debtToEquity', 'trailingEps', 'forwardPE', 'returnOnAssets',
                'operatingMargins', 'currentRatio', 'dividendYield',
            ]
            for col in fund_cols:
                x_col, y_col = f"{col}_x", f"{col}_y"
                if x_col in df.columns and y_col in df.columns:
                    df[col] = df[y_col].combine_first(df[x_col])
                    df.drop(columns=[x_col, y_col], inplace=True)
                elif x_col in df.columns:
                    df.rename(columns={x_col: col}, inplace=True)
                elif y_col in df.columns:
                    df.rename(columns={y_col: col}, inplace=True)

        cols_to_numeric = [
            'trailingPE', 'priceToBook', 'returnOnEquity', 'earningsGrowth', 
            'debtToEquity', 'trailingEps', 'forwardPE', 'returnOnAssets', 
            'operatingMargins', 'currentRatio', 'dividendYield'
        ]
        for col in cols_to_numeric:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
            else:
                df[col] = pd.Series(np.nan, index=df.index, dtype=float)

        g = df['earningsGrowth'].fillna(0).clip(lower=0,upper=0.25) * 100
        df['Graham Value'] = df['trailingEps'] * (8.5 + 2 * g)
        df['pct_undervaluation'] = ((df['Graham Value'] - df['Close']) / df['Close']) * 100
        df.replace([np.inf, -np.inf], np.nan, inplace=True)

        f1 = (df['returnOnAssets'] > 0).astype(int)
        f2 = (df['operatingMargins'] > 0).astype(int)
        f3 = (df['returnOnEquity'] > 0.10).astype(int)
        f4 = (df['currentRatio'] > 1.2).astype(int)
        f5 = (df['debtToEquity'] < 1).astype(int)
        df['F_Score'] = f1 + f2 + f3 + f4 + f5

        scoring_metrics = {
            'trailingPE': True, 'priceToBook': True, 'debtToEquity': True,
            'returnOnEquity': False, 'earningsGrowth': False, 'dividendYield': False,
            'Sharpe': False, 'Sortino': False, 'CAGR': False, 'Vol_Ann': True,
            'F_Score': False, 'pct_undervaluation': False
            # MDD et Avg_ADV_M sont des colonnes informationnelles (non scorées par défaut)
        }


        # Sécurisation absolue : la colonne 'Sector' doit exister pour le groupby du Z-score
        if 'Sector' not in df.columns:
            df['Sector'] = 'Inconnu'
        else:
            df['Sector'] = df['Sector'].fillna('Inconnu')

        sector_col = 'Sector' # La colonne est maintenant garantie à 100%
        
        if sector_col:
            logging.info(f"Scoring sectoriel activé sur la colonne : {sector_col}")
        else:
            logging.warning("Colonne secteur introuvable. Le scoring sera global (moins précis).")

        for col, lower_is_better in scoring_metrics.items():
            if col in df.columns:

                if sector_col:

                    df[col] = df[col].fillna(df.groupby(sector_col)[col].transform('median'))
                

                df[col] = df[col].fillna(df[col].median())

                z_col_name = f'Z_{col}'
                
                if sector_col:

                    global_mean = df[col].mean()
                    global_std = df[col].std()

                    def safe_zscore(x):
                        if len(x) < 5 or x.std() == 0:
                            return pd.Series(0, index=x.index)
                        return (x - x.mean()) / x.std()

                    df[z_col_name] = df.groupby(sector_col)[col].transform(safe_zscore)
                else:
                    df[z_col_name] = zscore(df[col], nan_policy='omit')
                

                df[z_col_name] = df[z_col_name].fillna(0)

                if lower_is_better:
                    df[z_col_name] *= -1
            else:
                logging.warning(f"La métrique de scoring '{col}' n'est pas disponible.")

        df.fillna(0, inplace=True)

        weights_to_use = self.custom_weights if self.custom_weights is not None else settings.SCORING_WEIGHTS
        
        df['Total_Score'] = 0
        for factor, weight in weights_to_use.items():
            z_factor = f'Z_{factor}'
            if z_factor in df.columns:
                df['Total_Score'] += df[z_factor] * weight
            else:
                logging.warning(f"Le facteur de Z-score '{z_factor}' défini dans les poids n'a pas été trouvé.")

        # --- CONSOLIDATION STRICTE DES METADONNEES ---
        # 1. Gestion de Name
        if 'name' in df.columns and 'Name' not in df.columns:
            df = df.rename(columns={'name': 'Name'})
            
        if 'Name' not in df.columns:
            df['Name'] = df[ticker_col]
        else:
            df['Name'] = df['Name'].fillna(df[ticker_col])

        # 2. Gestion de Sector
        if 'sector' in df.columns and 'Sector' not in df.columns:
            df = df.rename(columns={'sector': 'Sector'})
            
        if 'Sector' not in df.columns:
            df['Sector'] = 'Inconnu'
        else:
            df['Sector'] = df['Sector'].fillna('Inconnu')

        # 3. Gestion de Country
        if 'country' in df.columns and 'Country' not in df.columns:
            df = df.rename(columns={'country': 'Country'})
            
        if 'Country' not in df.columns:
            df['Country'] = 'Inconnu'
        else:
            df['Country'] = df['Country'].fillna('Inconnu')

        # --- NETTOYAGE FINAL ---
        if ticker_col != 'Ticker':
            df = df.rename(columns={ticker_col: 'Ticker'})
        if 'yf_symbol' in df.columns:
            df = df.drop(columns=['yf_symbol'])

        return df.sort_values(by='Total_Score', ascending=False)