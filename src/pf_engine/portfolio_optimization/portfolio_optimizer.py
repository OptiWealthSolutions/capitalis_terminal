import logging
import sys
from pathlib import Path
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import yfinance as yf
from .hrp_engine import run_hrp, apply_weight_constraints
from .markowitz_engine import run_min_volatility, run_mean_variance

from src.core import config as settings
from src.data_managers.data_provider import get_historical_returns

class Portfolio:
    def __init__(self, tickers, max_weight=1.0, min_weight=None, capital=20000, risk_aversion=0.5, max_assets=None):
        logging.info(f"Initialisation du portefeuille avec {len(tickers)} tickers.")
        
        final_tickers = []
        top20_loaded = False
        for t in tickers:
            if t in ("TOP20", "TOP_20_SCORED"):
                if not top20_loaded:
                    try:
                        df_scored = pd.read_csv(settings.FINAL_SCORED_PATH)
                        if not df_scored.empty and 'Ticker' in df_scored.columns:
                            df_scored = df_scored.sort_values(by='Total_Score', ascending=False)
                            top_20_count = max(1, int(len(df_scored) * 0.2))
                            top_tickers = df_scored.head(top_20_count)['Ticker'].tolist()
                            final_tickers.extend(top_tickers)
                            logging.info(f"Ajout automatique des {top_20_count} meilleurs actifs scorés.")
                            top20_loaded = True
                    except Exception as e:
                        logging.warning(f"Impossible de charger les actifs scorés (Top 20%) : {e}")
            else:
                final_tickers.append(t)
                
        # Yfinance ticker normalization map (dot-notation → dash-notation)
        _YF_MAP = {"BRK.B": "BRK-B", "BRK.A": "BRK-A", "BF.B": "BF-B", "BF.A": "BF-A"}

        def _normalize(t: str) -> str:
            t = str(t).strip().upper()
            return _YF_MAP.get(t, t.replace(".", "-"))

        def _valid_ticker(t: str) -> bool:
            if not t or t in ("TOP20", "TOP_20_SCORED"):
                return False
            # Preferred shares like GS/PA, MS/PP — no 10y price history,
            # slash also corrupts the cache file path.
            if "/" in t:
                return False
            return True

        self.tickers = list(dict.fromkeys([
            _normalize(x) for x in final_tickers
            if pd.notna(x) and _valid_ticker(str(x).strip().upper())
        ]))
        if max_assets is not None:
            self.tickers = self.tickers[:max_assets]
        self.max_weight = max_weight
        self.min_weight = min_weight
        self.capital = capital
        self.risk_aversion = risk_aversion
        self.period = settings.LOOK_BACK_PERIOD
        self.interval = "1d"
        self.returns = get_historical_returns(self.tickers, self.period, self.interval)
        if self.returns.empty:
            logging.error("Impossible de récupérer les données de rendements. Arrêt du processus.")
            raise ValueError("Impossible de récupérer les données de rendements. Arrêt du processus.")
        self.mu = self.returns.mean() * 252
        self.weights = None

    def Optimize(self, method="HRP"):
        self.method = method
        
        min_w = self.min_weight if self.min_weight is not None else 0.0
        max_w = self.max_weight if self.max_weight is not None else 1.0
        
        logging.info(f"Lancement de l'optimisation avec la méthode : {method.upper()}")
        if self.min_weight is not None or self.max_weight is not None:
            logging.info(f"Contraintes de poids : Min={min_w*100:.2f}%, Max={max_w*100:.2f}%")

        if method == "HRP":
            self.weights = run_hrp(self.returns, risk_aversion=self.risk_aversion)
            if self.min_weight is not None or self.max_weight is not None:
                self.weights = apply_weight_constraints(self.weights, min_weight=min_w, max_weight=max_w)
        
        elif method == "MinVol":
            self.weights = run_min_volatility(self.returns, min_w, max_w)

        elif method == "MeanVar":
            self.weights = run_mean_variance(self.returns, min_w, max_w, self.risk_aversion)

        elif method == "EqualWeights":
            if self.min_weight is not None or self.max_weight is not None:
                logging.warning("Les contraintes de poids ne sont pas applicables à la méthode 'EqualWeights'.")
            n = len(self.tickers)
            self.weights = pd.Series(1/n, index=self.tickers)
            
        self.weights /= self.weights.sum()
        
        logging.info("Optimisation terminée.")
        return self.weights

    def DisplayResults(self):
        if self.weights is None:
            logging.warning("Aucun poids calculé, impossible d'afficher les résultats.")
            return

        df_weights = self.weights.to_frame(name='Weight').reset_index()
        df_weights.columns = ['Ticker', 'Weight']
        
        df_weights['Allocation'] = df_weights["Weight"]*(self.capital)
        try:
            logging.debug(f"Chargement des metadonnées depuis {settings.FINAL_SCORED_PATH}")
            df_meta = pd.read_csv(settings.FINAL_SCORED_PATH)[['Ticker', 'Name', 'Sector']]
            df_plot = pd.merge(df_weights, df_meta, on='Ticker', how='left')
        except Exception as e:
            logging.warning(f"Impossible de charger les metadonnées du CSV: {e}.")
            df_plot = df_weights.copy()
            df_plot['Sector'] = pd.NA
            df_plot['Name'] = pd.NA

        missing_mask = df_plot['Name'].isna() | df_plot['Sector'].isna()
        if missing_mask.any():
            logging.info("Récupération des métadonnées pour les actifs manuels...")
            for idx in df_plot[missing_mask].index:
                ticker = df_plot.loc[idx, 'Ticker']
                try:
                    info = yf.Ticker(ticker).info
                    df_plot.loc[idx, 'Name'] = info.get('shortName', ticker)
                    df_plot.loc[idx, 'Sector'] = info.get('sector', 'Manual Input')
                except Exception:
                    df_plot.loc[idx, 'Name'] = ticker
                    df_plot.loc[idx, 'Sector'] = 'Non classé'

        df_plot = df_plot.sort_values(by='Weight', ascending=False).fillna('Inconnu')
        
        custom_colors = px.colors.qualitative.D3 

        logging.info("Génération des graphiques d'allocation...")
        fig_bar = px.bar(
            df_plot, 
            x='Ticker', 
            y='Weight',
            color='Sector',
            title=f"ALLOCATION DES ACTIFS - {self.method.upper()}",
            template="plotly_dark",
            color_discrete_sequence=custom_colors,
            text_auto='.2%'
        )
        
        fig_bar.update_layout(
            font_family="Verdana",
            title_font_size=20,
            paper_bgcolor="#121212", 
            plot_bgcolor="#121212",
            xaxis={'categoryorder':'total descending'},
            yaxis_title="Poids relatif",
            xaxis_title=None
        )
        fig_bar.show()

        fig_sun = px.sunburst(
            df_plot, 
            path=['Sector', 'Ticker'], 
            values='Weight',
            title="RÉPARTITION SECTORIELLE",
            template="plotly_dark",
            color='Weight',
            color_continuous_scale='Tealgrn'
        )
        
        fig_sun.update_layout(
            paper_bgcolor="#121212",
            title_font_size=20
        )
        fig_sun.show()

        print("\n" + "·"*90)
        print(f"{'  TICKER':<12} | {'NOM':<25} | {'SECTEUR':<20} | {'POIDS':<10} | {'MONTANT'}")
        print("·"*90)
        for _, row in df_plot.iterrows():
            name = str(row['Name'])[:23]
            print(f"  {row['Ticker']:<10} | {name:<25} | {str(row['Sector'])[:18]:<20} | {row['Weight']*100:>8.2f}% | {row['Allocation']:>8.2f}€")
        print("·"*90 + "\n")
        logging.info("Affichage des résultats terminé.")

    def SaveResult(self):
        output_path = settings.DATA_DIR / "portfolio_weights.csv"
        self.weights.to_csv(output_path)
        logging.info(f"Résultats du portefeuille exportés : {output_path}")