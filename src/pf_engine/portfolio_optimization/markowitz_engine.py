import logging
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.covariance import LedoitWolf

def run_min_volatility(returns, min_weight, max_weight):

    n_assets = len(returns.columns)
    lw = LedoitWolf().fit(returns)
    cov_matrix = pd.DataFrame(lw.covariance_, index=returns.columns, columns=returns.columns) * 252


    def portfolio_volatility(weights, cov_matrix):
        return np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))

    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
    bounds = tuple((min_weight, max_weight) for _ in range(n_assets))
    init_guess = np.array([1/n_assets] * n_assets)

    try:
        result = minimize(portfolio_volatility, init_guess, args=(cov_matrix,), 
                          method='SLSQP', bounds=bounds, constraints=constraints)
        if not result.success:
            logging.warning(f"L'optimisation MinVol a échoué: {result.message}. Retour à l'équipondération.")
            return pd.Series(1/n_assets, index=returns.columns)
        return pd.Series(result.x, index=returns.columns)
    except Exception as e:
        logging.error(f"Échec critique de l'optimisation MinVol ({e}). Retour à l'équipondération.")
        return pd.Series(1/n_assets, index=returns.columns)

def run_mean_variance(returns, min_weight, max_weight, risk_aversion):
    n_assets = len(returns.columns)
    lw = LedoitWolf().fit(returns)
    cov_matrix = pd.DataFrame(lw.covariance_, index=returns.columns, columns=returns.columns) * 252
    
    expected_returns = returns.ewm(span=252).mean().iloc[-1] * 252


    def utility_function(weights, expected_returns, cov_matrix, risk_aversion):
        portfolio_return = np.dot(weights, expected_returns)
        portfolio_volatility = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        return -(portfolio_return - 0.5 * risk_aversion * portfolio_volatility**2)

    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
    bounds = tuple((min_weight, max_weight) for _ in range(n_assets))
    init_guess = np.array([1/n_assets] * n_assets)

    try:
        result = minimize(utility_function, init_guess, args=(expected_returns, cov_matrix, risk_aversion),
                          method='SLSQP', bounds=bounds, constraints=constraints)
        if not result.success:
            logging.warning(f"L'optimisation MeanVar a échoué: {result.message}. Retour à l'équipondération.")
            return pd.Series(1/n_assets, index=returns.columns)
        return pd.Series(result.x, index=returns.columns)
    except Exception as e:
        logging.error(f"Échec critique de l'optimisation MeanVar ({e}). Retour à l'équipondération.")
        return pd.Series(1/n_assets, index=returns.columns)