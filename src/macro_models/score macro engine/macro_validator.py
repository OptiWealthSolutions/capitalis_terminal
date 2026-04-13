import pandas as pd
import numpy as np
import scipy.stats as stats
import plotly.graph_objects as go


class MacroValidator:
    """
    Module institutionnel de validation statistique pour les signaux macroéconomiques (Z-Scores).
    Évalue le pouvoir prédictif (Alpha), la stabilité temporelle et la relation monotone avec les rendements.
    """

    def compute_ic(self, signal: pd.Series, forward_returns: pd.Series) -> dict:
        """
        Calcule le Coefficient d'Information (IC) global via la corrélation de Spearman.

        Args:
            signal (pd.Series): Série temporelle du signal macroéconomique (Z-Score).
            forward_returns (pd.Series): Série temporelle des rendements futurs de l'actif cible.

        Returns:
            dict: Contient le score IC, la P-Value et le nombre d'observations (N).
        """
        df = pd.concat([signal, forward_returns], axis=1, keys=['signal', 'returns']).dropna()
        
        if len(df) < 2:
            return {'IC': np.nan, 'P-Value': np.nan, 'N': len(df)}
            
        ic_score, p_value = stats.spearmanr(df['signal'], df['returns'])
        
        return {
            'IC': float(ic_score),
            'P-Value': float(p_value),
            'N': int(len(df))
        }

    def plot_rolling_ic(self, signal: pd.Series, forward_returns: pd.Series, window: int = 252) -> go.Figure:
        """
        Calcule et affiche le Coefficient d'Information glissant (Rolling IC) pour évaluer la stabilité.

        Args:
            signal (pd.Series): Série temporelle du signal macro.
            forward_returns (pd.Series): Série temporelle des rendements futurs.
            window (int): Fenêtre glissante pour le calcul de la corrélation (défaut: 252 jours).

        Returns:
            go.Figure: Objet graphique Plotly représentant la distribution temporelle de l'IC.
        """
        df = pd.concat([signal, forward_returns], axis=1, keys=['signal', 'returns']).dropna()
        
        if len(df) < window:
            raise ValueError(f"Volume de données insuffisant pour une fenêtre de {window} périodes.")

        n = len(df)
        rolling_ic_values = [np.nan] * n
        signal_values = df['signal'].values
        returns_values = df['returns'].values
        
        for i in range(window - 1, n):
            ic, _ = stats.spearmanr(signal_values[i - window + 1 : i + 1], returns_values[i - window + 1 : i + 1])
            rolling_ic_values[i] = ic
            
        rolling_ic = pd.Series(rolling_ic_values, index=df.index)
        mean_ic = rolling_ic.mean()

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=rolling_ic.index, 
            y=rolling_ic,
            fill='tozeroy',
            mode='lines',
            line=dict(color='rgba(59, 130, 246, 0.8)', width=1.5),
            name='Rolling IC'
        ))
        
        fig.add_hline(
            y=mean_ic, 
            line_dash="dash", 
            line_color="red", 
            annotation_text=f"Mean IC: {mean_ic:.4f}",
            annotation_position="top left"
        )

        fig.update_layout(
            title=f"Rolling Information Coefficient ({window} periods)",
            xaxis_title="Date",
            yaxis_title="Spearman Rank Correlation",
            template="plotly_dark",
            hovermode="x unified"
        )
        
        return fig

    def plot_quantile_analysis(self, signal: pd.Series, forward_returns: pd.Series, quantiles: int = 5) -> go.Figure:
        """
        Effectue une analyse d'écart par quantiles (Quintile Spread) pour vérifier la monotonie du signal.

        Args:
            signal (pd.Series): Série temporelle du signal macro.
            forward_returns (pd.Series): Série temporelle des rendements futurs.
            quantiles (int): Nombre de segments pour la discrétisation (défaut: 5).

        Returns:
            go.Figure: Histogramme Plotly des rendements moyens par quantile.
        """
        df = pd.concat([signal, forward_returns], axis=1, keys=['signal', 'returns']).dropna()
        
        labels = [f"Q{i}" for i in range(1, quantiles + 1)]
        df['quantile'] = pd.qcut(df['signal'], q=quantiles, labels=labels, duplicates='drop')
        
        quantile_returns = df.groupby('quantile', observed=False)['returns'].mean()

        fig = go.Figure()
        fig.add_trace(go.Bar(
            x=quantile_returns.index,
            y=quantile_returns,
            marker_color=['#EF553B' if val < 0 else '#00CC96' for val in quantile_returns],
            name='Mean Return'
        ))

        fig.update_layout(
            title="Forward Returns by Signal Quantile (Monotonicity Check)",
            xaxis_title=f"Signal Quantile (1 = Bearish, {quantiles} = Bullish)",
            yaxis_title="Mean Forward Return",
            template="plotly_dark"
        )
        
        return fig