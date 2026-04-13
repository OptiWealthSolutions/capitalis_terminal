"""
Module d'analyse de la performance et d'attribution factorielle.
"""

import numpy as np
import pandas as pd
import statsmodels.api as sm
from typing import Dict
import pandas_datareader.data as web
import requests
import sys
from pathlib import Path

# --- Recherche dynamique de la racine pour importer le db_manager ---
current_path = Path(__file__).resolve()
for parent in [current_path.parent] + list(current_path.parents):
    if (parent / "data" / "db_manager.py").exists():
        if str(parent) not in sys.path:
            sys.path.insert(0, str(parent))
        break
        
try:
    from src.data_managers.db_manager import DatabaseManager
except ImportError:
    DatabaseManager = None


class _FamaFrenchSession(requests.Session):
    """
    Session HTTP personnalisée pour forcer le HTTPS et injecter un User-Agent.
    Contourne l'erreur 404 de pandas_datareader due à la migration du site de Ken French.
    """
    def get(self, url, **kwargs):
        if url.startswith("http://mba.tuck.dartmouth.edu"):
            url = url.replace("http://", "https://")
        kwargs.setdefault("headers", {})
        kwargs["headers"]["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        return super().get(url, **kwargs)


def get_fama_french_factors(start_date: str, end_date: str, model: str = '3') -> pd.DataFrame:
    """
    Récupère les facteurs Fama-French depuis le cache SQLite ou via pandas_datareader.
    """
    model_type = f"{model}_factors_daily"
    db = DatabaseManager() if DatabaseManager else None
    
    # 1. Vérification du cache SQLite
    if db:
        try:
            df_cache = db.get_fama_french_factors(start_date, end_date, model_type)
            # Approximation des jours ouvrés pour valider la robustesse du cache
            expected_days = len(pd.bdate_range(start=start_date, end=end_date))
            if not df_cache.empty and len(df_cache) >= expected_days * 0.8:
                return df_cache
        except Exception:
            pass

    # 2. Fallback Web avec session patchée (requests customisée)
    if str(model) == '3':
        factor_key = "F-F_Research_Data_Factors_daily"
    elif str(model) == '5':
        factor_key = "F-F_Research_Data_5_Factors_2x3_daily"
    else:
        factor_key = f"F-F_Research_Data_{model}_Factors_daily"
        
    session = _FamaFrenchSession()
    try:
        ff_factors = web.DataReader(factor_key, 'famafrench', start=start_date, end=end_date, session=session)[0]
    except Exception as e:
        raise ConnectionError(f"Échec du téléchargement réseau des facteurs Fama-French : {e}")

    # 3. Nettoyage des données (pourcentages en décimales)
    ff_factors = ff_factors / 100.0

    # 4. Enregistrement en cache local
    if db:
        try:
            db.upsert_fama_french_factors(ff_factors, model_type)
        except Exception:
            pass

    return ff_factors

def run_fama_french_regression(
    portfolio_returns: pd.Series,
    start_date: str,
    end_date: str,
    model: str = '3'
) -> Dict[str, float]:
    """
    Exécute une régression de la performance du portefeuille sur les facteurs de Fama-French.

    La régression suit le modèle :
    $$ R_p - R_f = \\alpha + \\beta_1(Mkt-Rf) + \\beta_2(SMB) + \\beta_3(HML) + \\epsilon $$
    Pour le modèle à 5 facteurs, les termes RMW (Profitability) et CMA (Investment) sont ajoutés.

    Args:
        portfolio_returns (pd.Series): Série temporelle des rendements quotidiens du portefeuille.
        start_date (str): Date de début ('YYYY-MM-DD').
        end_date (str): Date de fin ('YYYY-MM-DD').
        model (str): '3' pour le modèle à 3 facteurs, '5' pour le modèle à 5 facteurs.

    Returns:
        Dict[str, float]: Un dictionnaire contenant l'alpha annualisé, les bêtas, et le R².
    """
    # Obtenir les facteurs via cache local ou requêtes de fallback
    ff_factors = get_fama_french_factors(start_date, end_date, model)

    # Préparation des données et Alignement temporel (datetime strict)
    df = pd.DataFrame(index=pd.to_datetime(portfolio_returns.index))
    df['portfolio'] = portfolio_returns.values
    
    ff_factors.index = pd.to_datetime(ff_factors.index)
    
    # Fusion (Inner Join garantit l'alignement sans valeurs manquantes)
    df = df.join(ff_factors, how='inner')
    df.dropna(inplace=True)
    
    if df.empty:
        raise ValueError("Aucune donnée temporellement alignée entre le portefeuille et les facteurs.")
    
    # Calcul du rendement excédentaire du portefeuille
    df['portf_ex'] = df['portfolio'] - df['RF']

    # Définition des variables indépendantes (les facteurs)
    if model == '3':
        X = df[['Mkt-RF', 'SMB', 'HML']]
    elif model == '5':
        X = df[['Mkt-RF', 'SMB', 'HML', 'RMW', 'CMA']]
    else:
        raise ValueError("Le modèle doit être '3' ou '5'.")

    y = df['portf_ex']
    X = sm.add_constant(X) # Ajout de l'intercept (alpha)

    # Exécution de la régression linéaire OLS
    result = sm.OLS(y, X).fit()

    # Extraction des résultats
    alpha_daily = result.params.get('const', 0)
    # Annualisation linéaire : α_ann = α_daily × 252
    # (La formule composée (1+α)^252-1 surestime pour les alphas positifs non-négligeables)
    alpha_annualized = alpha_daily * 252

    output = {
        'alpha_annualized_pct': alpha_annualized * 100,
        'r_squared': result.rsquared,
        'r_squared_adj': result.rsquared_adj
    }
    output.update(result.params.drop('const').to_dict())

    return output


def max_drawdown(returns: pd.Series) -> float:
    """
    Calcule le Maximum Drawdown (MDD) d'une série de rendements quotidiens.

    Le MDD représente la plus grande baisse cumulée depuis un sommet historique,
    exprimée en décimal (ex : -0.35 signifie -35%). C'est la mesure standard
    du risque de perte extrême utilisée par Bloomberg et les gérants institutionnels.

    Args:
        returns: Série de rendements quotidiens (log ou discrets).

    Returns:
        float: MDD en décimal (toujours négatif ou nul).
    """
    if returns.empty:
        return 0.0
    wealth = (1 + returns).cumprod()
    rolling_max = wealth.cummax()
    drawdown_series = (wealth - rolling_max) / rolling_max
    return float(drawdown_series.min())


def calmar_ratio(cagr: float, mdd: float) -> float:
    """
    Calcule le Ratio de Calmar : CAGR / |MDD|.

    Un ratio élevé indique une bonne performance ajustée au drawdown maximum.
    Standard institutionnel pour évaluer les stratégies à faible drawdown.

    Args:
        cagr: Taux de croissance annuel composé (décimal, ex: 0.12 pour 12%).
        mdd:  Maximum Drawdown (décimal négatif, ex: -0.35).

    Returns:
        float: Ratio de Calmar. Retourne 0.0 si MDD nul.
    """
    if mdd == 0.0:
        return 0.0
    return cagr / abs(mdd)


def sortino_ratio(returns: pd.Series, cagr: float, rf_rate: float = 0.04) -> float:
    """
    Calcule le Ratio de Sortino : (CAGR - Rf) / Downside Deviation.

    Contrairement au Sharpe, pénalise uniquement la volatilité baissière.
    Préférable au Sharpe pour les stratégies asymétriques (options, carry trade).

    Args:
        returns: Série de rendements quotidiens.
        cagr:    Taux de croissance annuel composé (décimal).
        rf_rate: Taux sans risque annualisé (décimal, défaut 4%).

    Returns:
        float: Ratio de Sortino. Retourne 0.0 si downside deviation nulle.
    """
    if returns.empty:
        return 0.0
    downside = returns[returns < 0]
    if len(downside) < 5:
        return 0.0
    downside_dev = float(np.sqrt((downside**2).mean()) * np.sqrt(252))
    if downside_dev == 0:
        return 0.0
    return (cagr - rf_rate) / downside_dev