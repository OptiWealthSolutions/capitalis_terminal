"""
User settings/preferences router — per-user SQLite storage.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth.jwt_handler import get_current_user
from ..database import db_context

ROOT = Path(__file__).resolve().parent.parent.parent

logger = logging.getLogger(__name__)
router = APIRouter()

_PREFS_DB_PATH = ROOT / "data" / "user_prefs.db"
_PREFS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_DEFAULT_PREFS: dict[str, Any] = {
    "accent_color": "#7AA7E8",
    "default_capital": 20000,
    "currency": "EUR",
    "chart_template": "plotly_dark",
    "decimals": 2,
    "ui_density": "Normal",
    "risk_free_rate": 0.04,
    "default_benchmark": "SPY",
    "default_method": "Sharpe",
    "mc_simulations": 500,
    "data_horizon": "5y",
    "display_name": "",
}

_VALID_CURRENCIES  = {"EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "CNY"}
_VALID_DENSITIES   = {"Compact", "Normal", "Spacious"}
_VALID_TEMPLATES   = {"plotly_dark", "plotly", "ggplot2", "seaborn"}
_VALID_BENCHMARKS  = {"SPY", "QQQ", "MSCI_WORLD", "STOXX50", "DAX", "NONE"}
_VALID_METHODS     = {"Sharpe", "MinRisk", "EqualWeight", "MaxReturn", "RiskParity"}
_VALID_HORIZONS    = {"1y", "2y", "3y", "5y", "10y"}


def _init_prefs_db() -> None:
    with db_context(_PREFS_DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT PRIMARY KEY,
                prefs   TEXT NOT NULL
            )
        """)


_init_prefs_db()


def _load_prefs(user_id: str) -> dict[str, Any]:
    with db_context(_PREFS_DB_PATH) as conn:
        row = conn.execute(
            "SELECT prefs FROM user_preferences WHERE user_id = ?", (user_id,)
        ).fetchone()
    if row:
        try:
            saved = json.loads(row["prefs"])
            return {**_DEFAULT_PREFS, **saved}
        except Exception:
            pass
    return _DEFAULT_PREFS.copy()


def _save_prefs(user_id: str, prefs: dict[str, Any]) -> None:
    with db_context(_PREFS_DB_PATH) as conn:
        conn.execute(
            """INSERT INTO user_preferences (user_id, prefs) VALUES (?, ?)
               ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs""",
            (user_id, json.dumps(prefs)),
        )


class PreferencesRequest(BaseModel):
    accent_color:      str   = Field(default="#7AA7E8", pattern=r"^#[0-9A-Fa-f]{6}$")
    default_capital:   float = Field(default=20000, gt=0, le=1_000_000_000)
    currency:          str   = Field(default="EUR")
    chart_template:    str   = Field(default="plotly_dark")
    decimals:          int   = Field(default=2, ge=0, le=6)
    ui_density:        str   = Field(default="Normal")
    risk_free_rate:    float = Field(default=0.04, ge=0.0, le=0.30)
    default_benchmark: str   = Field(default="SPY")
    default_method:    str   = Field(default="Sharpe")
    mc_simulations:    int   = Field(default=500, ge=100, le=5000)
    data_horizon:      str   = Field(default="5y")
    display_name:      str   = Field(default="", max_length=64)

    def model_post_init(self, __context) -> None:
        if self.currency not in _VALID_CURRENCIES:
            raise ValueError(f"currency must be one of {sorted(_VALID_CURRENCIES)}")
        if self.ui_density not in _VALID_DENSITIES:
            raise ValueError(f"ui_density must be one of {sorted(_VALID_DENSITIES)}")
        if self.chart_template not in _VALID_TEMPLATES:
            raise ValueError(f"chart_template must be one of {sorted(_VALID_TEMPLATES)}")
        if self.default_benchmark not in _VALID_BENCHMARKS:
            raise ValueError(f"benchmark must be one of {sorted(_VALID_BENCHMARKS)}")
        if self.default_method not in _VALID_METHODS:
            raise ValueError(f"method must be one of {sorted(_VALID_METHODS)}")
        if self.data_horizon not in _VALID_HORIZONS:
            raise ValueError(f"data_horizon must be one of {sorted(_VALID_HORIZONS)}")


@router.get("/preferences")
def get_preferences(user: dict = Depends(get_current_user)) -> Any:
    return _load_prefs(user["sub"])


@router.put("/preferences")
def update_preferences(req: PreferencesRequest, user: dict = Depends(get_current_user)) -> Any:
    prefs = req.model_dump()
    try:
        _save_prefs(user["sub"], prefs)
    except Exception as exc:
        logger.error("Failed to save preferences: %s", exc)
        raise HTTPException(status_code=500, detail="Could not persist preferences.")
    return {"status": "saved", "preferences": prefs}


@router.delete("/preferences")
def reset_preferences(user: dict = Depends(get_current_user)) -> Any:
    try:
        _save_prefs(user["sub"], _DEFAULT_PREFS)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not reset preferences.")
    return {"status": "reset", "preferences": _DEFAULT_PREFS}


@router.get("/status")
def get_status() -> Any:
    _ENV_KEYS = [
        "ALPHA_VANTAGE_API_KEY",
        "FRED_API_KEY",
        "JWT_SECRET_KEY",
        "ALLOWED_ORIGINS",
    ]
    keys = {k: bool(os.environ.get(k, "").strip()) for k in _ENV_KEYS}
    data_dir = ROOT / "data"
    return {
        "api_keys": keys,
        "data_dir_exists": data_dir.exists(),
        "backend_version": "2.0.0",
    }
