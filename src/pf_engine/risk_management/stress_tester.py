"""
Moteur de stress-test basé sur des régimes de marché historiques (HMM).
"""

import pandas as pd
import numpy as np
from typing import Tuple

from .monte_carlo_simulation import run_monte_carlo_portfolio


def run_regime_stress_test(
    initial_capital: float,
    weights: np.ndarray,
    historical_returns: pd.DataFrame,
    regime_assignments: pd.Series,
    target_regime: int,
    horizon_days: int,
    n_simulations: int
) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Exécute une simulation de Monte Carlo conditionnelle à un régime de marché.

    Le processus consiste à isoler les périodes historiques appartenant à un régime
    spécifique (ex: "BEAR / HIGH VOL"), à calculer la moyenne et la covariance
    des rendements sur ces seules périodes, puis à utiliser ces paramètres pour
    amorcer une simulation de Monte Carlo.

    Args:
        initial_capital (float): Capital de départ pour la simulation.
        weights (np.ndarray): Vecteur des poids du portefeuille.
        historical_returns (pd.DataFrame): DataFrame des rendements quotidiens de tous les actifs.
        regime_assignments (pd.Series): Série contenant le numéro de régime pour chaque date.
        target_regime (int): Le numéro du régime à utiliser pour le stress-test (ex: 1).
        horizon_days (int): Horizon de la simulation en jours.
        n_simulations (int): Nombre de trajectoires à simuler.

    Returns:
        Tuple[pd.DataFrame, pd.Series]:
        - DataFrame des trajectoires de portefeuille simulées.
        - Série des valeurs finales de chaque simulation.
    """
    # 1. Filtrer les rendements pour le régime cible
    regime_dates = regime_assignments[regime_assignments == target_regime].index
    regime_returns = historical_returns.loc[regime_dates]

    if regime_returns.empty:
        raise ValueError(f"Aucune donnée historique trouvée pour le régime {target_regime}. Le stress-test ne peut pas continuer.")

    # 2. Calculer les paramètres (mu, Sigma) spécifiques au régime
    mu_vec_regime = regime_returns.mean().values * 252
    cov_matrix_regime = regime_returns.cov().values * 252

    # 3. Lancer la simulation de Monte Carlo avec les paramètres du régime
    df_paths = run_monte_carlo_portfolio(
        initial_capital=initial_capital,
        weights=weights,
        mu_vec=mu_vec_regime,
        cov_matrix=cov_matrix_regime,
        horizon_days=horizon_days,
        n_simulations=n_simulations
    )

    final_values = df_paths.iloc[-1]

    return df_paths, final_values