"""
Module for Macroeconomic Regime Detection.

Implements a Hidden Markov Model (HMM) to identify latent market regimes
based on volatility, momentum, yield curve spreads, and return distributions.
Ensures robust state selection via Bayesian Information Criterion (BIC).
"""

import logging
import warnings
import pandas as pd
import numpy as np
from hmmlearn.hmm import GaussianHMM
from typing import Optional
from scipy.stats import skew, kurtosis

# Suppression des avertissements de dépréciation liés à hmmlearn
warnings.filterwarnings("ignore", category=DeprecationWarning)

class HMMModeler:
    """
    Mathematical engine estimating latent market regimes via Hidden Markov Models.
    Incorporates advanced distributional moments (Skewness, Kurtosis) to detect tail-risk environments.
    """

    def __init__(self, max_states: int = 3, random_state: int = 42):
        """
        Instantiates the HMM constraint engine.
        
        Args:
            max_states (int): Hard limit on latent states to prevent overfitting (typically 3: Bull, Bear, Sideways).
            random_state (int): Seed for MLE convergence reproducibility.
        """
        self.max_states = max_states
        self.random_state = random_state
        self.best_model: Optional[GaussianHMM] = None
        self.optimal_states: Optional[int] = None

    def _prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Constructs the multi-dimensional observation matrix required for state inference.
        Extracts statistical moments and macroeconomic indicators.
        
        Args:
            df (pd.DataFrame): Operational price and macro dataframe.
            
        Returns:
            pd.DataFrame: Matrix stripped of NaNs, ready for MLE estimation.
        """
        features = pd.DataFrame(index=df.index)
        
        # 1. Rendements Continus
        features['Returns'] = np.log(df['Close'] / df['Close'].shift(1))
        
        # 2. Moments Distributionnels (Fenêtre 20 jours - Tail Risk)
        features['Skewness'] = features['Returns'].rolling(window=20).apply(skew, raw=True)
        features['Kurtosis'] = features['Returns'].rolling(window=20).apply(kurtosis, raw=True)
        
        # 3. Volatilité (Proxy GARCH/Historique si VIX indisponible)
        if 'VIX' in df.columns:
            features['VIX'] = df['VIX']
        else:
            features['Realized_Vol'] = features['Returns'].rolling(window=20).std()
            
        # 4. Inversion de la courbe des taux (Macro)
        if 'T10Y2Y' in df.columns:
            features['T10Y2Y'] = df['T10Y2Y']
            
        # 5. Momentum (Technique)
        if 'RSI' in df.columns:
            features['RSI'] = df['RSI']
            
        return features.dropna()

    def _compute_bic(self, model: GaussianHMM, X: np.ndarray) -> float:
        """
        Calculates the Bayesian Information Criterion (BIC).
        Applies a harsh penalty for added states to combat overfitting.
        
        Args:
            model (GaussianHMM): Fitted instance of the model.
            X (np.ndarray): Observation matrix.
            
        Returns:
            float: Estimated BIC coefficient.
        """
        log_likelihood = model.score(X)
        n_features = X.shape[1]
        n_states = model.n_components
        
        n_params = n_states * (n_states - 1) + n_states * n_features + n_states * n_features * (n_features + 1) / 2
        
        bic = -2 * log_likelihood + n_params * np.log(X.shape[0])
        return bic

    def predict_regimes(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Executes model training (MLE) and returns the temporal sequence of inferred states.
        
        Args:
            df (pd.DataFrame): Time series matrix containing price and macro variables.
            
        Returns:
            pd.DataFrame: Appended target vector 'HMM_Regime'.
        """
        X_df = self._prepare_features(df)
        if X_df.empty:
            logging.warning("SYSTEM WARNING: HMM FEATURE MATRIX IS EMPTY. SKIPPING REGIME DETECTION.")
            return pd.DataFrame(index=df.index)
            
        X = X_df.values
        best_bic = np.inf
        
        logging.info("SYSTEM: INITIALIZING HMM OPTIMIZATION ROUTINE VIA BIC...")
        for n_states in range(2, self.max_states + 1):
            model = GaussianHMM(n_components=n_states, covariance_type="full", n_iter=100, random_state=self.random_state)
            model.fit(X)
            bic = self._compute_bic(model, X)
            logging.info(f"HMM STATE SEARCH: {n_states} COMPONENTS | BIC: {bic:.2f}")
            
            if bic < best_bic:
                best_bic = bic
                self.best_model = model
                self.optimal_states = n_states
                
        logging.info(f"SYSTEM: OPTIMAL HMM CONFIGURATION LOCKED AT {self.optimal_states} REGIMES.")
        
        out = pd.DataFrame(index=X_df.index)
        out['HMM_Regime'] = self.best_model.predict(X)
        
        # Ré-alignement sur l'index d'origine (remplissage des 20 premiers jours de latence)
        return out.reindex(df.index).ffill().bfill()