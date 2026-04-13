import numpy as np
import pandas as pd
from src.pf_engine.portfolio_optimization.portfolio_optimizer import Portfolio

def find_optimal_parameters(df_scored, method, capital, min_w, max_w):
    """
    Exécute un Grid Search pour trouver le top_n et le lambda maximisant le Sharpe Ratio.
    """
    max_assets = len(df_scored)
    # Grille de recherche pour le nombre d'actifs (de 5 au max disponible, par pas de 5)
    top_n_grid = [n for n in range(5, max_assets + 1, 5)]
    if max_assets not in top_n_grid:
        top_n_grid.append(max_assets)
        
    # Grille de recherche pour l'aversion au risque
    lambda_grid = [0.5, 1.0, 2.0, 5.0, 10.0, 15.0] if method in ["HRP", "MeanVar"] else [None]

    best_sharpe = -np.inf
    best_params = {'top_n': min(20, max_assets), 'risk_aversion': 5.0}

    for n in top_n_grid:
        tickers = df_scored.head(n)['Ticker'].tolist()
        
        # Sécurité mathématique : le poids max doit permettre d'investir 100%
        min_possible_max_w = 1.0 / len(tickers)
        safe_max_w = max(max_w, min_possible_max_w)
        
        for lam in lambda_grid:
            try:
                portfolio = Portfolio(
                    tickers=tickers, capital=capital, 
                    min_weight=min_w, max_weight=safe_max_w, risk_aversion=lam
                )
                weights = portfolio.Optimize(method=method)
                if weights is None or weights.empty:
                    continue
                
                # Calcul du Sharpe
                returns = portfolio.returns.dot(weights)
                years = len(returns) / 252
                if years <= 0: continue
                cagr = (returns + 1).prod() ** (1/years) - 1
                vol = returns.std() * np.sqrt(252)
                sharpe = (cagr - 0.04) / vol if vol > 0 else 0
                
                if sharpe > best_sharpe:
                    best_sharpe = sharpe
                    best_params = {'top_n': n, 'risk_aversion': lam if lam is not None else 5.0}
            except Exception:
                continue
                
    return best_params