import pandas as pd
import yfinance as yf

def calculate_real_drift(target_weights_dict: dict, capital: float = 100000.0) -> pd.DataFrame:
    """
    Calcule l'érosion réelle (Drift) du portefeuille en se basant sur 
    les mouvements de marché récents (1 mois).
    """
    tickers = list(target_weights_dict.keys())
    if not tickers:
        return pd.DataFrame()
        
    try:
        # Téléchargement de l'historique récent
        hist = yf.download(tickers, period="1mo", progress=False)
        
        # Extraction sécurisée des prix de clôture
        if isinstance(hist.columns, pd.MultiIndex):
            close_px = hist['Close']
        else:
            close_px = hist[['Close']] if 'Close' in hist else hist
            
        current_values = {}
        
        for t in tickers:
            target_w = target_weights_dict[t]
            
            if t in close_px.columns:
                px_series = close_px[t].dropna()
                if len(px_series) >= 2:
                    p0 = float(px_series.iloc[0])   # Prix d'Achat initial
                    p1 = float(px_series.iloc[-1])  # Prix Actuel
                    
                    shares = (capital * target_w) / p0
                    current_values[t] = shares * p1
                else:
                    current_values[t] = capital * target_w
            else:
                current_values[t] = capital * target_w
                
        total_current_value = sum(current_values.values())
        
        results = []
        for t in tickers:
            target_w = target_weights_dict[t]
            curr_w = current_values[t] / total_current_value if total_current_value > 0 else target_w
            results.append({'Ticker': t, 'Target Weight': target_w, 'Current Weight': curr_w, 'Drift': curr_w - target_w, 'Drift_abs': abs(curr_w - target_w)})
            
        return pd.DataFrame(results).set_index('Ticker')
        
    except Exception:
        # Fallback de sécurité si l'API échoue
        df = pd.DataFrame.from_dict(target_weights_dict, orient='index', columns=['Target Weight'])
        df['Current Weight'] = df['Target Weight']
        df['Drift'] = 0.0
        df['Drift_abs'] = 0.0
        return df