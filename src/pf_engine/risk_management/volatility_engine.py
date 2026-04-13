import yfinance as yf
import numpy as np
import pandas as pd
from arch import arch_model

class GARCHModeler:
    def __init__(self):
        pass

    def fetch_and_prepare_data(self, ticker: str, period: str = "5y") -> pd.Series:
        df = yf.download(ticker, period=period, progress=False)
        if isinstance(df.columns, pd.MultiIndex):
            df = df['Close']
        else:
            df = df[['Close']]
            
        returns = np.log(df / df.shift(1)) * 100
        returns = returns.dropna().squeeze()
        
        # WINSORIZATION : ECRASAGE DES OUTLIERS AUX EXTREMITES (1% ET 99%)
        lower_bound = returns.quantile(0.01)
        upper_bound = returns.quantile(0.99)
        returns = returns.clip(lower=lower_bound, upper=upper_bound)
        
        return returns

    def fit_garch(self, returns: pd.Series):
        am = arch_model(returns, vol='Garch', p=1, q=1, dist='Normal')
        res = am.fit(disp='off')
        
        forecasts = res.forecast(horizon=1, reindex=False)
        forecast_vol = np.sqrt(forecasts.variance.iloc[-1, 0])
        
        return res.conditional_volatility, forecast_vol