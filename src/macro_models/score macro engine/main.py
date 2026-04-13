import matplotlib.pyplot as plt
from data_fetch import GetData
from engine import get_uniqueness_weights, generate_macro_dashboard



data_map = GetData()
df_scores = generate_macro_dashboard(data_map)

plt.figure(figsize=(12, 6))




for col in df_scores.columns:
    if col != 'Score': 
        plt.plot(df_scores.index, df_scores[col], marker='o', label=col)

plt.title('Macro Scores Snapshot (Latest)')
plt.axhline(0, color='black', linewidth=0.8, linestyle='--')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()

print(df_scores)