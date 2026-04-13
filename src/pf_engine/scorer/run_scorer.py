import sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from scorer.scorer import Scorer
from src.core import config as settings

def run():
    try:
        print(f"Lecture des actifs depuis : {settings.SCREENED_ASSETS_PATH}")
        scorer = Scorer() 
    except (FileNotFoundError, ValueError) as e:
        print(f"Erreur: {e}")
        print("Veuillez d'abord exécuter le screener pour générer le fichier 'screened_assets.csv'.")
        sys.exit(1)

    df_scored = scorer.ComputeScore()

    output_path = settings.FINAL_SCORED_PATH

    df_scored.to_csv(output_path, index=False)

    print(f"{len(df_scored)} actifs ont été notés.")

if __name__ == "__main__":
    run()
