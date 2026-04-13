import os
import pandas_datareader.data as web
import pandas as pd
from datetime import datetime, timedelta

def get_macro_data():
    api_key = os.getenv('FRED_API_KEY')
    if api_key is None:
        raise ValueError("FRED_API_KEY is missing in environment variables.")

    # Période : 10 ans
    start = datetime.now() - timedelta(days=10*365)
    end = datetime.now()

    zones_tickers = {
        'USD': {
            'CPI': 'CPIAUCSL', 
            'PMI': 'INDPRO', 
            'Unemployment': 'UNRATE', 
            'Interest_Rate': 'FEDFUNDS'
        },
        'EUR': {
            'CPI': 'CP0000EZ19M086NEST', 
            'Unemployment': 'LRHUTTTTEZM156S', 
            'Interest_Rate': 'IRSTCI01EZM156N'

        },
        'JPY': {
            'CPI': 'JPNCPIALLMINMEI', 
            'PMI': 'JPNPROINDMISMEI', 
            'Unemployment': 'LRHUTTTTJPM156S', 
            'Interest_Rate': 'IRSTCB01JPM156N'
        },
        'GBP': {
            'CPI': 'GBRCPIALLMINMEI', 
            'PMI': 'GBRPROINDMISMEI', 
            'Unemployment': 'LRHUTTTTGBM156S', 
            'Interest_Rate': 'BOERUKM' 
        },
        'AUD': {
            'CPI': 'AUSCPIALLQINMEI', 
            'PMI': 'AUSPROINDQISMEI', 
            'Unemployment': 'LRUNTTTTAUM156S', 
            'Interest_Rate': 'IRSTCI01AUM156N'
        },
        'NZD': {
            'CPI': 'NZLCPIALLQINMEI', 
            'PMI': 'NZLPROINDQISMEI', 
            'Unemployment': 'LRUNTTTTNZQ156S', 
            'Interest_Rate': 'IRSTCI01NZM156N'
        }
    }

    global_data = {}

    for zone, indicators in zones_tickers.items():
        zone_df = pd.DataFrame()
        
        for ind_name, ticker in indicators.items():
            try:

                raw_data = web.DataReader(ticker, 'fred', start, end)
                
                data = raw_data.resample('ME').last().ffill()
                
                col_actual = f"{ind_name}_First_Release_Actual"
                col_forecast = f"{ind_name}_Forecast"
                col_std = f"{ind_name}_Rolling_Std"
                col_surprise = f"{ind_name}_Surprise_Z"
                
                temp_df = pd.DataFrame(index=data.index)
                temp_df[col_actual] = data[ticker]
                
                temp_df[col_forecast] = temp_df[col_actual].ewm(span=12, adjust=False).mean().shift(1)
                temp_df[col_std] = temp_df[col_actual].rolling(window=24, min_periods=6).std().shift(1)
                temp_df[col_surprise] = (temp_df[col_actual] - temp_df[col_forecast]) / temp_df[col_std]
                
                if zone_df.empty:
                    zone_df = temp_df
                else:
                    zone_df = zone_df.join(temp_df, how='outer')
            
            except Exception as e:
                print(f"Erreur d'extraction pour la zone {zone} - {ind_name}: {str(e)}")
                continue 
        
        if not zone_df.empty:
            global_data[zone] = zone_df.ffill().dropna()

    return global_data
                
                
