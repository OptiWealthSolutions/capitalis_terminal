import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime
from data_fetch import get_macro_data

def _compute_cross_indicator_weights(events_df: pd.DataFrame, window_days: int = 5) -> pd.Series:
    events_series = pd.Series(1, index=events_df['TimeStamp'])
    concurrent_events = events_series.rolling(window=f'{window_days}D', closed='both').sum()
    concurrent_events = concurrent_events.replace(0, 1)
    uniqueness_weight = 1.0 / concurrent_events
    return uniqueness_weight.reset_index(drop=True)

def aggregate_macro_scores(data_map):
    global_z_scores = {}
    category_map = {
        'CPI': 'Inflation',
        'PMI': 'Croissance', 
        'Interest_Rate': 'Taux',
        'Unemployment': 'Emploi',
        'Consumer_Sentiment': 'Confiance' 
    }
    
    signs = {'CPI': 1, 'PMI': 1, 'Interest_Rate': 1, 'Unemployment': -1, 'Consumer_Sentiment': 1}
    halflife_map = {'CPI': 5, 'Interest_Rate': 5, 'Unemployment': 5, 'PMI': 5, 'Consumer_Sentiment': 5}
    
    today = pd.to_datetime(datetime.today().date())

    for zone, df in data_map.items():
        if df.empty:
            continue

        df_proc = df.copy().reset_index()
        if 'TimeStamp' not in df_proc.columns:
            if 'Date' in df_proc.columns:
                df_proc.rename(columns={'Date': 'TimeStamp'}, inplace=True)
            elif 'index' in df_proc.columns:
                df_proc.rename(columns={'index': 'TimeStamp'}, inplace=True)
            elif 'DATE' in df_proc.columns:
                df_proc.rename(columns={'DATE': 'TimeStamp'}, inplace=True)
        
        df_proc['TimeStamp'] = pd.to_datetime(df_proc['TimeStamp'])
        df_proc = df_proc.sort_values('TimeStamp').reset_index(drop=True)
        df_proc = df_proc.ffill()
        
        weights = _compute_cross_indicator_weights(df_proc, window_days=5)
        
        min_date = df_proc['TimeStamp'].min()
        if pd.isna(min_date):
            continue
        daily_index = pd.date_range(start=min_date, end=today, freq='D')
        
        available_indicators = []
        for c in df_proc.columns:
            if c.endswith('_First_Release_Actual'):
                available_indicators.append(c.replace('_First_Release_Actual', ''))
            elif c.endswith('_Actual'):
                available_indicators.append(c.replace('_Actual', ''))
        available_indicators = list(set(available_indicators))

        zone_total_scores = np.zeros(len(daily_index))
        zone_active_count = np.zeros(len(daily_index))

        for ind in available_indicators:
            col_actual = f"{ind}_First_Release_Actual" if f"{ind}_First_Release_Actual" in df_proc.columns else f"{ind}_Actual"
            col_surprise = f"{ind}_Surprise_Z"

            hl = halflife_map.get(ind, 10)
            lambda_ = np.log(2) / hl
            sign = signs.get(ind, 1) 
            
            if col_surprise in df_proc.columns:
                norm_shock = df_proc[col_surprise].fillna(0)
            else:
                col_consensus = f"{ind}_Forecast" if f"{ind}_Forecast" in df_proc.columns else f"{ind}_Consensus"
                if col_consensus not in df_proc.columns:
                    df_proc[col_consensus] = df_proc[col_actual].shift(1)
                raw_shock = df_proc[col_actual] - df_proc[col_consensus]
                rolling_std = raw_shock.rolling(12).std().shift(1).replace(0.0, np.nan).fillna(1.0)
                norm_shock = (raw_shock / rolling_std).fillna(0)
            
            shock_series = pd.Series(norm_shock.values * weights.values * sign, index=df_proc['TimeStamp'])
            shock_series = shock_series.groupby(shock_series.index).sum()
            
            active_events = pd.Series(1, index=df_proc.loc[pd.notna(df_proc[col_actual]), 'TimeStamp'])
            active_events = active_events.groupby(active_events.index).max()
            
            ind_daily = pd.DataFrame(index=daily_index)
            ind_daily['shock'] = shock_series
            ind_daily['shock'] = ind_daily['shock'].fillna(0.0)
            
            ind_daily['is_active'] = active_events
            ind_daily['is_active'] = ind_daily['is_active'].ffill().fillna(0.0)
            
            scores = np.zeros(len(daily_index))
            decay_factor = np.exp(-lambda_ * 1.0)
            shock_vals = ind_daily['shock'].values
            
            for t in range(1, len(daily_index)):
                scores[t] = scores[t-1] * decay_factor + shock_vals[t]
                
            scores = np.nan_to_num(scores, nan=0.0, posinf=0.0, neginf=0.0)
            
            zone_total_scores += scores
            zone_active_count += ind_daily['is_active'].values

        zone_daily_avg = np.zeros(len(daily_index))
        mask = zone_active_count > 0
        zone_daily_avg[mask] = zone_total_scores[mask] / zone_active_count[mask]
        
        zone_series = pd.Series(zone_daily_avg, index=daily_index)
        
        rolling_mean = zone_series.rolling(window=252, min_periods=21).mean()
        rolling_std = zone_series.rolling(window=252, min_periods=21).std()
        
        rolling_std = rolling_std.replace(0.0, np.nan).fillna(1e-6)
        zone_final_z_score = (zone_series - rolling_mean) / rolling_std
        zone_final_z_score = zone_final_z_score.replace([np.inf, -np.inf], np.nan).fillna(0.0)
        
        global_z_scores[zone] = zone_final_z_score

    if global_z_scores:
        df_final = pd.DataFrame(global_z_scores)
        return df_final
    else:
        return pd.DataFrame()
