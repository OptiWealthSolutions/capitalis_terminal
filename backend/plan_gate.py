"""
Plan-based feature enforcement.

Central source of truth for what each subscription tier can do.
Frontend reads /billing/limits to mirror gating in UI.
Backend routes import `require_plan` + `check_limit` to enforce.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status

from .auth.jwt_handler import get_current_user
from .db import get_subscription

# ---------------------------------------------------------------------------
# Limits per plan — single source of truth
# ---------------------------------------------------------------------------

PLAN_ORDER = ["free", "pro", "premium", "institutional"]

PLAN_LIMITS: dict[str, dict[str, Any]] = {
    "free": {
        "max_portfolios":       1,
        "optimization_methods": ["EqualWeights", "MinVol"],
        "screener_runs_per_day": 3,
        "screener_top_n":       50,      # only top 50 by market cap
        "max_alerts":           3,
        "pdf_export":           False,
        "monte_carlo":          False,
        "market_map":           False,
        "predictions":          False,
        "custom_alerts":        False,
        "ml_alpha":             False,
        "ml_alpha_conviction":  False,
        "tracker_portfolios":   1,
    },
    "pro": {
        "max_portfolios":       5,
        "optimization_methods": ["EqualWeights", "MinVol", "MeanVar", "HRP"],
        "screener_runs_per_day": None,   # unlimited
        "screener_top_n":       None,    # full universe
        "max_alerts":           20,
        "pdf_export":           True,
        "monte_carlo":          True,
        "market_map":           True,
        "predictions":          False,
        "custom_alerts":        True,
        "ml_alpha":             False,
        "ml_alpha_conviction":  False,
        "tracker_portfolios":   None,    # unlimited
    },
    "premium": {
        "max_portfolios":       None,    # unlimited
        "optimization_methods": ["EqualWeights", "MinVol", "MeanVar", "HRP", "Max_Sharpe"],
        "screener_runs_per_day": None,
        "screener_top_n":       None,
        "max_alerts":           None,    # unlimited
        "pdf_export":           True,
        "monte_carlo":          True,
        "market_map":           True,
        "predictions":          True,
        "custom_alerts":        True,
        "ml_alpha":             True,
        "ml_alpha_conviction":  True,
        "tracker_portfolios":   None,
    },
    # Legacy alias — existing subs stored as "institutional" still resolve
    # to the new Premium tier.
    "institutional": {
        "max_portfolios":       None,
        "optimization_methods": ["EqualWeights", "MinVol", "MeanVar", "HRP", "Max_Sharpe"],
        "screener_runs_per_day": None,
        "screener_top_n":       None,
        "max_alerts":           None,
        "pdf_export":           True,
        "monte_carlo":          True,
        "market_map":           True,
        "predictions":          True,
        "custom_alerts":        True,
        "ml_alpha":             True,
        "ml_alpha_conviction":  True,
        "tracker_portfolios":   None,
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_plan_for_user(user_id: str) -> str:
    sub = get_subscription(user_id)
    if not sub:
        return "free"
    # Treat cancelled/past_due subs as free
    if sub["status"] not in ("active", "trialing"):
        return "free"
    return sub["plan"] or "free"


def get_limits(plan: str) -> dict[str, Any]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])


def plan_rank(plan: str) -> int:
    try:
        return PLAN_ORDER.index(plan)
    except ValueError:
        return 0


def require_plan(min_plan: str):
    """FastAPI dependency — rejects if user's plan < min_plan."""
    def _dep(user: dict = Depends(get_current_user)) -> dict:
        plan = get_plan_for_user(user["sub"])
        if plan_rank(plan) < plan_rank(min_plan):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Upgrade required: this endpoint needs plan '{min_plan}', you are on '{plan}'.",
            )
        return user
    return _dep


def require_feature(feature: str):
    """Reject if user's plan lacks a boolean feature (pdf_export, monte_carlo, etc.)."""
    def _dep(user: dict = Depends(get_current_user)) -> dict:
        plan = get_plan_for_user(user["sub"])
        if not get_limits(plan).get(feature, False):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Feature '{feature}' not included in plan '{plan}'.",
            )
        return user
    return _dep


def check_optimization_method(user_id: str, method: str) -> None:
    plan = get_plan_for_user(user_id)
    allowed = get_limits(plan)["optimization_methods"]
    if method not in allowed:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Method '{method}' not available on plan '{plan}'. Allowed: {allowed}.",
        )


def check_portfolio_count(user_id: str, current_count: int) -> None:
    plan = get_plan_for_user(user_id)
    max_pf = get_limits(plan)["max_portfolios"]
    if max_pf is not None and current_count >= max_pf:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Portfolio limit reached ({max_pf}) on plan '{plan}'. Upgrade to add more.",
        )


def check_alert_count(user_id: str, current_count: int) -> None:
    plan = get_plan_for_user(user_id)
    max_alerts = get_limits(plan).get("max_alerts")
    if max_alerts is not None and current_count >= max_alerts:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Alert limit reached ({max_alerts}) on plan '{plan}'. Upgrade for more.",
        )


def apply_screener_top_n(user_id: str, df):
    """Returns df sliced to plan's screener_top_n (sorted by market_cap desc)."""
    plan = get_plan_for_user(user_id)
    top_n = get_limits(plan).get("screener_top_n")
    if top_n is None or df is None or df.empty:
        return df
    if "market_cap" in df.columns:
        df = df.sort_values("market_cap", ascending=False, na_position="last")
    return df.head(top_n)
