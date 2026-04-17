import numpy as np
import pandas as pd
from typing import Tuple

def run_monte_carlo_portfolio(
    initial_capital: float, 
    weights: np.ndarray,
    mu_vec: np.ndarray,
    cov_matrix: np.ndarray,
    horizon_days: int = 252, 
    n_simulations: int = 1000) -> pd.DataFrame:

    num_assets = len(weights)
    dt = 1.0 / 252.0
    
    try:
        # Factorisation de Cholesky de la matrice de covariance annuelle
        L = np.linalg.cholesky(cov_matrix)
    except np.linalg.LinAlgError:
        # Régularisation légère si la matrice n'est pas parfaitement définie positive
        cov_matrix = cov_matrix + np.eye(num_assets) * 1e-6
        L = np.linalg.cholesky(cov_matrix)
    
    # Chocs aléatoires normaux indépendants (Z ~ N(0, 1))
    Z = np.random.normal(0, 1, size=(num_assets, horizon_days, n_simulations))
    Z_reshaped = Z.reshape(num_assets, -1)
    
    # Introduction de la corrélation et transformation pour un pas journalier
    L_daily = L * np.sqrt(dt)
    diffusion = L_daily.dot(Z_reshaped).reshape(num_assets, horizon_days, n_simulations)
    
    # Volatilités individuelles et Drift
    sigmas = np.sqrt(np.diag(cov_matrix))
    drift = (mu_vec - 0.5 * sigmas**2) * dt
    drift = drift.reshape(-1, 1, 1)
    
    daily_returns = np.exp(drift + diffusion)
    
    ones = np.ones((num_assets, 1, n_simulations))
    price_paths = np.concatenate([ones, daily_returns], axis=1)
    cum_price_paths = price_paths.cumprod(axis=1)
    
    capital_alloc = initial_capital * weights
    capital_alloc = capital_alloc.reshape(-1, 1, 1)
    
    port_paths = np.sum(capital_alloc * cum_price_paths, axis=0)
    
    return pd.DataFrame(port_paths)

def calculate_var_cvar(
    final_values: np.ndarray,
    initial_capital: float = None
) -> Tuple[float, float, float]:
    """
    Calcule la Value at Risk (VaR) et la Conditional Value at Risk (CVaR).

    Deux modes selon la présence de `initial_capital` :

    - **VaR absolue** (recommandé, si initial_capital fourni) :
        VaR = initial_capital - percentile(5%)
        Représente la perte maximale probable depuis le capital investi.
        C'est l'interprétation standard attendue par un utilisateur.

    - **VaR relative** (mode legacy, si initial_capital=None) :
        VaR = percentile(5%) - mean_expected_value
        Représente l'écart négatif par rapport à la valeur finale moyenne attendue.
        Utile pour comparer des scénarios entre eux, mais MOINS intuitif pour
        l'affichage utilisateur (ne reflète pas la perte depuis le capital initial).

    Args:
        final_values: Distribution des valeurs finales du portefeuille (n_simulations,)
        initial_capital: Capital investi initial. Si None → mode relative VaR (legacy).

    Returns:
        (var_95, var_99, cvar_95) — toutes en négatif (pertes)
    """
    if initial_capital is not None:
        # VaR absolue : perte depuis le capital de départ (interprétation standard)
        var_95  = np.percentile(final_values, 5)  - initial_capital
        var_99  = np.percentile(final_values, 1)  - initial_capital
        cvar_95 = np.mean(final_values[final_values <= np.percentile(final_values, 5)]) - initial_capital
    else:
        # VaR relative (legacy) : perte par rapport à la valeur moyenne attendue
        mean_expected_value = np.mean(final_values)
        var_95  = np.percentile(final_values, 5) - mean_expected_value
        var_99  = np.percentile(final_values, 1) - mean_expected_value
        cvar_95 = np.mean(final_values[final_values <= np.percentile(final_values, 5)]) - mean_expected_value

    return float(var_95), float(var_99), float(cvar_95)

def calculate_var_cvar_simple(
    final_values: np.ndarray,
    initial_capital: float,
) -> tuple[float, float]:
    """
    Simplified wrapper returning (var_95, cvar_95) as POSITIVE loss amounts.
    Intended for API consumers that display losses with a leading '-'.
    """
    var_95, _var_99, cvar_95 = calculate_var_cvar(final_values, initial_capital)
    return abs(var_95), abs(cvar_95)