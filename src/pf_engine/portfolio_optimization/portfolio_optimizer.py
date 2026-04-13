import logging
import sys
from pathlib import Path
import pandas as pd
import importlib.util
import plotly.express as px
import plotly.graph_objects as go
import yfinance as yf
from .hrp_engine import run_hrp, apply_weight_constraints
from .markowitz_engine import run_min_volatility, run_mean_variance



from src.core import config as settings

try:
    data_provider_path = settings.DATA_DIR / "pf_engine" / "data_provider.py"
    spec = importlib.util.spec_from_file_location("data_provider", data_provider_path)
    data_provider_module = importlib.util.module_from_spec(spec)
    sys.modules["data_provider"] = data_provider_module
    spec.loader.exec_module(data_provider_module)
    get_historical_returns = data_provider_module.get_historical_returns
except Exception as e:
    logging.error(f"Impossible de charger dynamiquement le module data_provider: {e}")
    raise ImportError(f"Impossible de charger dynamiquement le module data_provider: {e}")

class Portfolio:
    def __init__(self, tickers, max_weight=1.0, min_weight=None, capital=20000, risk_aversion=0.5):
        logging.info(f"Initialisation du portefeuille avec {len(tickers)} tickers.")
        self.tickers = tickers
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
        self.mu = self.returns.ewm(span=252).mean().iloc[-1] * 252
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