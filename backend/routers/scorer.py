"""
Multi-factor equity scorer router.
Endpoints: run scorer, get latest scored assets, update weights.
"""

import sys
import logging
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.pf_engine.scorer.scorer import Scorer
from src.core import config as settings
from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()


class ScorerWeightsRequest(BaseModel):
    weights: dict[str, float] = Field(..., min_length=1)

    def model_post_init(self, __context) -> None:
        for k, v in self.weights.items():
            if v < 0 or v > 1:
                raise ValueError(f"Weight for '{k}' must be in [0, 1].")
        total = sum(self.weights.values())
        if not (0.99 <= total <= 1.01):
            raise ValueError(f"Weights must sum to 1.0 (got {total:.4f}).")


# ---------------------------------------------------------------------------
# POST /scorer/run
# ---------------------------------------------------------------------------
@router.post("/run")
def run_scorer(req: ScorerWeightsRequest) -> Any:
    """
    Runs the Z-score-based multi-factor scorer on the screened asset universe.
    Reads screened_assets.csv as input. Requires the screener to have run first.
    """
    screened_path = settings.SCREENED_ASSETS_PATH
    if not screened_path.exists():
        raise HTTPException(
            status_code=404,
            detail="screened_assets.csv not found. Run the screener first via POST /screener/run.",
        )

    try:
        df_screened = pd.read_csv(screened_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to read screened assets.")

    if df_screened.empty:
        raise HTTPException(status_code=422, detail="Screened asset list is empty.")

    try:
        scorer = Scorer(df_input=df_screened, custom_weights=req.weights)
        df_scored = scorer.ComputeScore()
    except Exception as exc:
        logger.error("Scorer execution error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Scorer failed: {exc}")

    if df_scored is None or df_scored.empty:
        return {"count": 0, "assets": []}

    # Tri sécurisé insensible à la casse
    sort_col = "Total_Score" if "Total_Score" in df_scored.columns else "TOTAL_SCORE" if "TOTAL_SCORE" in df_scored.columns else None
    if sort_col:
        df_scored = df_scored.sort_values(sort_col, ascending=False).reset_index(drop=True)

    # Sauvegarde sur disque requise pour que le endpoint /latest fonctionne
    try:
        df_scored.to_csv(settings.FINAL_SCORED_PATH, index=False)
    except Exception as exc:
        logger.warning(f"Could not save scored assets: {exc}")

    # Arrondi sécurisé uniquement sur les colonnes numériques pour éviter les TypeError
    numeric_cols = df_scored.select_dtypes(include=['number']).columns
    df_scored[numeric_cols] = df_scored[numeric_cols].round(4)
    records = df_scored.to_dict(orient="records")
    return {"count": len(records), "assets": records}


# ---------------------------------------------------------------------------
# GET /scorer/latest
# ---------------------------------------------------------------------------
@router.get("/latest")
def get_latest_scored() -> Any:
    """Returns the last scorer output saved to disk (equity_scored.csv)."""
    path = settings.FINAL_SCORED_PATH
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="equity_scored.csv not found. Run POST /scorer/run first.",
        )
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to read scored assets.")
    return {"count": len(df), "assets": df.to_dict(orient="records")}


# ---------------------------------------------------------------------------
# GET /scorer/weights/default
# ---------------------------------------------------------------------------
@router.get("/weights/default")
def get_default_weights() -> Any:
    """Returns the current default scoring weights from config."""
    return {"weights": settings.SCORING_WEIGHTS}