"""
User settings/preferences router.
Stores preferences as JSON on disk (single-user mode).
SaaS migration: replace disk persistence with PostgreSQL per user_id.
"""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent.parent

logger = logging.getLogger(__name__)
router = APIRouter()

PREFS_FILE = ROOT / "data" / "user_prefs.json"

_DEFAULT_PREFS: dict[str, Any] = {
    "accent_color": "#3B82F6",
    "default_capital": 20000,
    "currency": "EUR",
    "chart_template": "plotly_dark",
    "decimals": 2,
    "ui_density": "Normal",
}

_VALID_CURRENCIES = {"EUR", "USD", "GBP", "CHF", "JPY"}
_VALID_DENSITIES = {"Compact", "Normal", "Spacious"}
_VALID_TEMPLATES = {"plotly_dark", "plotly", "ggplot2", "seaborn"}


class PreferencesRequest(BaseModel):
    accent_color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")
    default_capital: float = Field(default=20000, gt=0, le=1_000_000_000)
    currency: str = Field(default="EUR")
    chart_template: str = Field(default="plotly_dark")
    decimals: int = Field(default=2, ge=0, le=6)
    ui_density: str = Field(default="Normal")

    def model_post_init(self, __context) -> None:
        if self.currency not in _VALID_CURRENCIES:
            raise ValueError(f"currency must be one of {sorted(_VALID_CURRENCIES)}")
        if self.ui_density not in _VALID_DENSITIES:
            raise ValueError(f"ui_density must be one of {sorted(_VALID_DENSITIES)}")
        if self.chart_template not in _VALID_TEMPLATES:
            raise ValueError(f"chart_template must be one of {sorted(_VALID_TEMPLATES)}")


def _load_prefs() -> dict[str, Any]:
    if PREFS_FILE.exists():
        try:
            saved = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
            return {**_DEFAULT_PREFS, **saved}
        except Exception:
            pass
    return _DEFAULT_PREFS.copy()


def _save_prefs(prefs: dict[str, Any]) -> None:
    PREFS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# GET /settings/preferences
# ---------------------------------------------------------------------------
@router.get("/preferences")
def get_preferences() -> Any:
    return _load_prefs()


# ---------------------------------------------------------------------------
# PUT /settings/preferences
# ---------------------------------------------------------------------------
@router.put("/preferences")
def update_preferences(req: PreferencesRequest) -> Any:
    prefs = req.model_dump()
    try:
        _save_prefs(prefs)
    except OSError as exc:
        logger.error("Failed to save preferences: %s", exc)
        raise HTTPException(status_code=500, detail="Could not persist preferences.")
    return {"status": "saved", "preferences": prefs}


# ---------------------------------------------------------------------------
# DELETE /settings/preferences (reset to defaults)
# ---------------------------------------------------------------------------
@router.delete("/preferences")
def reset_preferences() -> Any:
    try:
        _save_prefs(_DEFAULT_PREFS)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Could not reset preferences.")
    return {"status": "reset", "preferences": _DEFAULT_PREFS}
