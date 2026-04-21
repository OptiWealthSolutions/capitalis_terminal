"""
ML Predictions router.
Endpoints: model status, run inference, SHAP feature importance.
"""

import sys
import logging
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ..auth.jwt_handler import get_current_user
from ..plan_gate import get_limits, get_plan_for_user

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core import config as settings
from ..cache.memory_cache import cache

logger = logging.getLogger(__name__)
router = APIRouter()

_models: dict = {}


def _load_models() -> dict:
    """Lazy-loads joblib artifacts. Returns empty dict if models don't exist yet."""
    if _models:
        return _models
    try:
        import joblib
        primary_path: Path = settings.PRIMARY_MODEL_PATH
        meta_path: Path = settings.META_MODEL_PATH
        if primary_path.exists():
            _models["primary"] = joblib.load(primary_path)
        if meta_path.exists():
            _models["meta"] = joblib.load(meta_path)
        logger.info("ML models loaded: %s", list(_models.keys()))
    except Exception as exc:
        logger.error("Model loading error: %s", exc, exc_info=True)
    return _models


class InferenceRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=20)


# ---------------------------------------------------------------------------
# GET /predictions/status
# ---------------------------------------------------------------------------
@router.get("/status")
def get_model_status() -> Any:
    """Returns which models are loaded and their paths."""
    primary_exists = settings.PRIMARY_MODEL_PATH.exists()
    meta_exists = settings.META_MODEL_PATH.exists()
    return {
        "primary_model": {
            "path": str(settings.PRIMARY_MODEL_PATH),
            "exists": primary_exists,
        },
        "meta_model": {
            "path": str(settings.META_MODEL_PATH),
            "exists": meta_exists,
        },
        "loaded": list(_load_models().keys()),
    }


# ---------------------------------------------------------------------------
# POST /predictions/reload
# ---------------------------------------------------------------------------
@router.post("/reload")
def reload_models() -> Any:
    """Forces reload of joblib model artifacts from disk."""
    _models.clear()
    loaded = list(_load_models().keys())
    if not loaded:
        raise HTTPException(status_code=404, detail="No model artifacts found on disk.")
    return {"status": "reloaded", "models": loaded}


# ---------------------------------------------------------------------------
# POST /predictions/infer
# ---------------------------------------------------------------------------
@router.post("/infer")
def run_inference(req: InferenceRequest, current_user: dict = Depends(get_current_user)) -> Any:
    """
    Runs the stacked ML model for each ticker and returns:
    - prediction label (BUY / HOLD / SELL)
    - confidence score
    NOTE: FeatureEngineer must be importable from machine_learning_models package.
    """
    plan = get_plan_for_user(current_user["sub"])
    if not get_limits(plan).get("ml_alpha", False):
        raise HTTPException(
            status_code=402,
            detail=f"ML predictions require Pro or higher (current plan: {plan}).",
        )
    models = _load_models()
    if "primary" not in models:
        raise HTTPException(
            status_code=503,
            detail="Primary ML model not loaded. Train and export it first.",
        )

    results = []
    for ticker in req.tickers:
        try:
            from machine_learning_models.data_pipeline.features_engineering import FeatureEngineer
            fe = FeatureEngineer(ticker=ticker)
            X = fe.build_features()
            if X is None or X.empty:
                results.append({"ticker": ticker, "error": "Feature engineering returned empty."})
                continue

            X_latest = X.iloc[[-1]]
            primary_pred = models["primary"].predict(X_latest)[0]
            primary_proba = models["primary"].predict_proba(X_latest)[0]

            if "meta" in models:
                meta_input = pd.DataFrame([primary_proba])
                final_pred = models["meta"].predict(meta_input)[0]
                final_proba = models["meta"].predict_proba(meta_input)[0]
            else:
                final_pred = primary_pred
                final_proba = primary_proba

            label_map = {0: "SELL", 1: "HOLD", 2: "BUY"}
            results.append({
                "ticker": ticker,
                "prediction": label_map.get(int(final_pred), str(final_pred)),
                "confidence": round(float(max(final_proba)), 4),
                "probabilities": {label_map.get(i, str(i)): round(float(p), 4) for i, p in enumerate(final_proba)},
            })
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="machine_learning_models package not found. Check your Python path.",
            )
        except Exception as exc:
            logger.error("Inference error for %s: %s", ticker, exc, exc_info=True)
            results.append({"ticker": ticker, "error": str(exc)})

    return {"results": results}
