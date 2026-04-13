import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
from engine import *
from data_fetch import GetData


def optimize_halflives(data_map, target_asset_returns=None):
    # Grille de recherche (en jours)
    test_halflives = [1,2,3,4,5,6,7]
    

    indicator_types = ['CPI', 'PMI', 'Unemployment', 'Interest_Rate']
    
    best_params = {}
    results_matrix = pd.DataFrame(index=test_halflives, columns=indicator_types)


    for ind_type in indicator_types:
        best_ic = -1
        best_hl = 10 # Default
        
        for hl in test_halflives:
            ic_scores = []
            
            for zone, df in data_map.items():
                col_act = f"{ind_type}_Actual"
                col_cons = f"{ind_type}_Consensus"
                
                if col_act not in df.columns: continue

                df_test = df.copy().reset_index()
                raw_shock = df_test[col_act] - df_test[col_cons]
                rolling_std = raw_shock.rolling(12).std().shift(1).fillna(1.0).replace(0, 1)
                norm_shock = (raw_shock / rolling_std).fillna(0)
                
                # Decay
                lambda_ = np.log(2) / hl
                deltas = df_test['DATE'].diff().dt.total_seconds().fillna(0) / 86400
                scores = np.zeros(len(df_test))

                for t in range(1, len(df_test)):
                    decay = np.exp(-lambda_ * deltas.iloc[t])
                    scores[t] = scores[t-1] * decay + norm_shock.iloc[t]

                s_series = pd.Series(scores)
                ic = s_series.corr(s_series.shift(-10)) # Stabilité à 5 jours
                ic_scores.append(ic)
            
            # Moyenne des IC sur toutes les zones
            avg_ic = np.nanmean(ic_scores)
            results_matrix.loc[hl, ind_type] = avg_ic
            
            if avg_ic > best_ic:
                best_ic = avg_ic
                best_hl = hl
        
        best_params[ind_type] = best_hl
        print(f"Meilleure demi-vie pour {ind_type} : {best_hl} jours (Stability IC: {best_ic:.3f})")

    return best_params, results_matrix

data_map = GetData()
optimized_halflives, res_mat = optimize_halflives(data_map)

print("\n--- Paramètres Optimisés à utiliser ---")
print(optimized_halflives)

# Heatmap de stabilité
plt.figure(figsize=(8, 6))
sns.heatmap(res_mat.astype(float), annot=True, cmap='viridis', fmt=".3f")
plt.title("Score de Stabilité du Signal selon la Demi-Vie")
plt.ylabel("Demi-Vie Testée (Jours)")
plt.xlabel("Indicateur")
plt.show()