"""
Module de calcul de la contribution au risque et de budgeting.
"""

import pandas as pd
import numpy as np
from typing import Tuple


def calculate_mctr(weights: np.ndarray, cov_matrix: pd.DataFrame) -> Tuple[pd.DataFrame, float]:
    """
    Calcule la Contribution Marginale au Risque (MCTR) et la contribution totale
    de chaque actif à la volatilité du portefeuille.

    Formules mathématiques :
    - Volatilité du portefeuille (sigma_p):
      $$ \\sigma_p = \\sqrt{w^T \\Sigma w} $$
    - Contribution Marginale au Risque (MCTR_i):
      $$ \\text{MCTR}_i = \\frac{(\\Sigma w)_i}{\\sigma_p} $$
    - Contribution Totale au Risque (CTR_i):
      $$ \\text{CTR}_i = w_i \\times \\text{MCTR}_i $$

    Args:
        weights (np.ndarray): Vecteur des poids des actifs.
        cov_matrix (pd.DataFrame): Matrice de covariance des rendements des actifs.

    Returns:
        Tuple[pd.DataFrame, float]: 
        - Un DataFrame contenant les poids, MCTR, et la contribution au risque en %.
        - La volatilité totale du portefeuille.
    """
    # S'assurer que les poids sont un vecteur numpy
    weights = np.array(weights)

    # Calcul de la volatilité du portefeuille
    portfolio_volatility = np.sqrt(weights.T @ cov_matrix @ weights)

    # Calcul du MCTR
    marginal_contribution = (cov_matrix @ weights) / portfolio_volatility

    # Calcul de la contribution totale de chaque actif
    total_contribution = weights * marginal_contribution

    # Création du rapport
    report_df = pd.DataFrame({
        'Weight': weights,
        'MCTR': marginal_contribution,
        'Total_Risk_Contribution': total_contribution
    }, index=cov_matrix.columns)

    # Normalisation de la contribution pour l'exprimer en pourcentage du risque total
    report_df['Risk_Contribution_pct'] = (report_df['Total_Risk_Contribution'] / portfolio_volatility) * 100

    return report_df, portfolio_volatility