"""
Fichier de configuration central pour le pipeline de recherche CAPITALIS V2.

Ce fichier contient tous les paramètres, chemins, règles et poids
utilisés par les différents modules du projet (Screener, Scorer).
"""

import os
import re
import logging
from pathlib import Path
from dotenv import load_dotenv

# Charge les variables depuis .env (ignoré par git) — ne remplace jamais une var déjà définie
load_dotenv()

fred_api_key = os.environ.get("FRED_API_KEY")
if not fred_api_key:
    logging.warning("FRED_API_KEY non définie. Définissez-la dans votre fichier .env ou en variable d'environnement.")

# ==============================================================================
# 1. CONFIGURATION GÉNÉRALE
# ==============================================================================
LOOK_BACK_PERIOD = '10y' # ajouter cette variable dans les fichiers du pipeline d'investissement

# --- Configuration du Logging ---
# Définit le niveau de verbosité et le format des messages de log.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(module)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# --- Configuration des Chemins (Paths) ---
# Centralise les chemins vers les répertoires et fichiers de données.
# BASE_DIR = racine du projet (capitalis_terminal/), pas src/core/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"

# --- Sécurité : Création automatique du dossier des bases de données ---
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Parseur Automatique des Couleurs du config.toml ---
def _load_colors_from_toml():
    config_path = BASE_DIR / ".streamlit" / "config.toml"
    colors = {}
    if config_path.exists():
        content = config_path.read_text(encoding="utf-8")
        for line in content.splitlines():
            # Capture toutes les clés = "valeur" (ex: primaryColor = "#d7691a", blue = "#3B82F6")
            match = re.match(r'^\s*([a-zA-Z0-9_]+)\s*=\s*"([^"]+)"', line)
            if match:
                colors[match.group(1)] = match.group(2)
    return colors

COLORS = _load_colors_from_toml()

# Fichier de sortie du screener, entrée pour le scorer
SCREENED_ASSETS_PATH = DATA_DIR / "screened_assets.csv"
# Fichier de sortie final avec les scores
FINAL_SCORED_PATH = DATA_DIR / "equity_scored.csv"
DATA_PROVIDER_PATH = BASE_DIR / "data" / "pf_engine" / "data_provider.py"

# --- Bases de données SQLite Fractionnées ---
DB_MARKET_PATH = DATA_DIR / "data_base_MarketData.db"
DB_SCORES_PATH = DATA_DIR / "data_base_Scoring.db"
DB_PORTFOLIOS_PATH = DATA_DIR / "data_base_Portfolios.db"

# --- Machine Learning Model Paths ---
MODEL_DIR = DATA_DIR / "ml_models"
PRIMARY_MODEL_PATH = MODEL_DIR / "primary_model.joblib"
META_MODEL_PATH = MODEL_DIR / "meta_model.joblib"

# ==============================================================================
# 2. CONFIGURATION DU SCREENER
# ==============================================================================

# --- Sources de Données (Tickers) ---
# Liste des URLs Wikipedia pour récupérer les listes de tickers des indices.
LINKS = [
    "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "https://en.wikipedia.org/wiki/Nasdaq-100",
    "https://en.wikipedia.org/wiki/CAC_40",
    "https://en.wikipedia.org/wiki/DAX",
    "https://en.wikipedia.org/wiki/EURO_STOXX_50",
    "https://en.wikipedia.org/wiki/Nikkei_225",
]

# --- Règles de Filtrage Fondamental ---
# Dictionnaire des critères utilisés pour la première sélection d'entreprises.
# Seules les entreprises respectant TOUTES ces règles sont conservées.
RULES_DICT = {
    # 'freeCashflow': {'op': '>', 'val': 0}, # NOTE: 'freeCashflow' n'est pas toujours dispo

    'returnOnEquity': {'op': '>=', 'type': 'dynamic_sector', 'multiplier': 0.8}, 
    
    'currentRatio':   {'op': '>=', 'type': 'dynamic_sector', 'multiplier': 0.8},    
    
    'forwardPE':      {'op': '<=', 'type': 'dynamic_sector', 'multiplier': 1.2},        
    
    'earningsGrowth': {'op': '>=', 'type': 'dynamic_sector', 'multiplier': 0.5}, 
}




# --- Nettoyage et Mapping des Tickers ---
# Gère les exceptions et la standardisation des symboles boursiers.

# Cas spéciaux où le ticker de Yahoo Finance diffère de celui de Wikipedia
SPECIAL_TICKER_MAP = {
    'BF.B': 'BF-B',     # Brown-Forman
    'BRK.B': 'BRK-B',   # Berkshire Hathaway
    'DHL-DE': 'DPW.DE',
    'VOW-DE': 'VOW3.DE',
    'MT-AS.PA': 'MT.AS',
    'ADS-DE': 'ADS.DE',
    'AIR-PA': 'AIR.PA',
    'ORA-PA': 'ORA.PA',
    'SAP-DE': 'SAP.DE',
    'SIE-DE': 'SIE.DE'
}

# Suffixes à ajouter par pays pour interroger l'API yfinance
COUNTRY_SUFFIX_MAP = {
    'France': '.PA', 'Germany': '.DE', 'Italy': '.MI', 'Spain': '.MC',
    'Netherlands': '.AS', 'Belgium': '.BR', 'Finland': '.HE',
    'Japan': '.T', 'Ireland': '.IR'
}

# Suffixes à ne pas modifier s'ils sont déjà présents
PROTECTED_SUFFIXES = ['.DE', '.PA', '.MI', '.MC', '.AS', '.BR', '.HE', '.FI', '.LS', '.ST', '.CO', '.T']

# ==============================================================================
# 3. CONFIGURATION DU SCORER
# ==============================================================================

# --- Poids pour le Calcul du Score Total ---
# Chaque métrique est d'abord convertie en Z-score. Le score total est la somme
# pondérée de ces Z-scores. La somme des poids est de 1.0.
# Le scorer inverse automatiquement les métriques où "plus bas c'est mieux"
# (ex: Volatilité, PE), donc tous les poids ici doivent être positifs.
SCORING_WEIGHTS = {
    # Qualité (35%)
    'F_Score': 0.25,          # Solidité financière (ROA, marges, liquidité...)
    'returnOnEquity': 0.10,   # Rentabilité
    # Valeur (25%)
    'pct_undervaluation': 0.05, # Potentiel de hausse selon la valeur de Graham
    'trailingPE': 0.20,       # Ratio Cours/Bénéfice (un ratio bas est meilleur)
    # Momentum / Risque (40%)
    'Sharpe': 0.20,           # Rendement ajusté au risque (Sharpe)
    'Sortino': 0.00,          # Rendement ajusté au risque baissier — poids 0 par défaut (ajustable en UI)
    'CAGR': 0.05,             # Croissance annuelle composée du cours
    'earningsGrowth': 0.10,   # Croissance des bénéfices
    'Vol_Ann': 0.05,          # Volatilité annualisée (une volatilité basse est meilleure)
}
