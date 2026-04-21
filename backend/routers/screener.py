"""
Equity screener router.
Endpoints: run screen, list/save/delete presets, get screened assets.
"""

import sys
import json
import logging
import time
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Depends
from ..auth.jwt_handler import get_current_user
from ..plan_gate import get_limits, get_plan_for_user

# Daily screener run counter: {user_id: (count, day_str)}
_screener_daily: dict[str, tuple[int, str]] = {}

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.pf_engine.screener.main_screener import Screener
from src.core import config as settings
from ..schemas.screener import ScreenerRunRequest, PresetSaveRequest
from ..cache.memory_cache import cache, SCREENER_TTL

logger = logging.getLogger(__name__)
router = APIRouter()

PRESETS_BASE_DIR = ROOT / "data" / "screener_presets"
PRESETS_BASE_DIR.mkdir(parents=True, exist_ok=True)


def _user_presets_dir(user_id: str) -> Path:
    d = PRESETS_BASE_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d

SYSTEM_PRESETS: dict[str, Any] = {
    "SYSTEM_Deep_Value": {
        "criteria": {
            "forwardPE": {"op": "<=", "val": 15.0},
            "priceToBook": {"op": "<=", "val": 1.5},
            "dividendYield": {"op": ">=", "val": 0.04},
        }
    },
    "SYSTEM_High_Growth": {
        "criteria": {
            "earningsGrowth": {"op": ">=", "val": 0.20},
            "revenueGrowth": {"op": ">=", "val": 0.15},
            "forwardPE": {"op": "<=", "val": 40.0},
        }
    },
    "SYSTEM_Quality_Profitability": {
        "criteria": {
            "returnOnEquity": {"op": ">=", "val": 0.15},
            "operatingMargins": {"op": ">=", "val": 0.15},
            "currentRatio": {"op": ">=", "val": 1.5},
        }
    },
}


def _load_presets(user_id: str) -> dict[str, Any]:
    """Merges system presets with per-user presets from disk."""
    presets = SYSTEM_PRESETS.copy()
    for path in _user_presets_dir(user_id).glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            presets[path.stem] = data
        except Exception as exc:
            logger.warning("Failed to load preset %s: %s", path.name, exc)
    return presets


# ---------------------------------------------------------------------------
# GET /screener/presets
# ---------------------------------------------------------------------------
@router.get("/presets")
def list_presets(user: dict = Depends(get_current_user)) -> Any:
    return _load_presets(user["sub"])


# ---------------------------------------------------------------------------
# POST /screener/presets
# ---------------------------------------------------------------------------
@router.post("/presets")
def save_preset(req: PresetSaveRequest, user: dict = Depends(get_current_user)) -> Any:
    if req.name.startswith("SYSTEM_"):
        raise HTTPException(status_code=403, detail="Cannot overwrite system presets.")

    path = _user_presets_dir(user["sub"]) / f"{req.name}.json"
    try:
        criteria_data = {k: v.model_dump() for k, v in req.criteria.items()}
        path.write_text(
            json.dumps({"criteria": criteria_data}, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.error("Failed to save preset %s: %s", req.name, exc)
        raise HTTPException(status_code=500, detail="Could not write preset to disk.")
    return {"status": "saved", "name": req.name}


# ---------------------------------------------------------------------------
# DELETE /screener/presets/{name}
# ---------------------------------------------------------------------------
@router.delete("/presets/{name}")
def delete_preset(name: str, user: dict = Depends(get_current_user)) -> Any:
    if name.startswith("SYSTEM_"):
        raise HTTPException(status_code=403, detail="Cannot delete system presets.")

    path = _user_presets_dir(user["sub"]) / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found.")
    path.unlink()
    return {"status": "deleted", "name": name}


# ---------------------------------------------------------------------------
# POST /screener/run
# ---------------------------------------------------------------------------
@router.post("/run")
def run_screener(req: ScreenerRunRequest, current_user: dict = Depends(get_current_user)) -> Any:
    """
    Executes the multi-factor equity screener.
    Returns a list of assets passing all criteria with their fundamental metrics.
    Screener results are cached for SCREENER_TTL seconds.
    """
    from datetime import date
    plan = get_plan_for_user(current_user["sub"])
    daily_limit = get_limits(plan)["screener_runs_per_day"]
    if daily_limit is not None:
        today = str(date.today())
        count, day = _screener_daily.get(current_user["sub"], (0, today))
        if day != today:
            count, day = 0, today
        if count >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily screener limit reached ({daily_limit}/day on plan '{plan}'). Upgrade for unlimited runs.",
            )
        _screener_daily[current_user["sub"]] = (count + 1, day)

    criteria_raw = {k: {"op": v.op, "val": v.val} for k, v in req.criteria.items()}
    cache_key = f"screener_{hash(json.dumps(criteria_raw, sort_keys=True))}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        screener = Screener()
        df_result = screener.run_screener(custom_rules=criteria_raw)
    except Exception as exc:
        logger.error("Screener execution error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Screener failed: {exc}")

    if df_result is None or df_result.empty:
        return {"count": 0, "assets": []}

    # Sauvegarde vitale pour que le Scorer puisse lire l'input de l'univers
    try:
        df_result.to_csv(settings.SCREENED_ASSETS_PATH, index=False)
    except Exception as exc:
        logger.warning("Failed to save screened assets: %s", exc)

    records = df_result.to_dict(orient="records")
    result = {"count": len(records), "assets": records}
    cache.set(cache_key, result, ttl=SCREENER_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /screener/latest
# ---------------------------------------------------------------------------
@router.get("/latest")
def get_latest_screened() -> Any:
    """Returns the last screener output saved to disk (screened_assets.csv)."""
    path = settings.SCREENED_ASSETS_PATH
    if not path.exists():
        raise HTTPException(status_code=404, detail="No screened asset file found. Run a screen first.")
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to read screened assets.")
    return {"count": len(df), "assets": df.to_dict(orient="records")}