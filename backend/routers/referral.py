"""
Referral / parrainage system.

Endpoints:
    GET  /referral/code      auth   - returns user's code + share URL
    GET  /referral/stats     auth   - invitee count, months earned, list
    POST /referral/redeem    auth   - records a referral (referee uses ref code)

Reward logic (in billing webhook):
    On first paid subscription event for a referee, the referrer's
    Stripe subscription is extended by 30 days via trial_end mutation.
"""

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth.jwt_handler import get_current_user
from ..db import (
    ensure_user_referral_code,
    get_referrals_for_referrer,
    get_user_by_id,
    get_user_by_referral_code,
    record_referral,
)

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")


class RedeemRequest(BaseModel):
    code: str = Field(min_length=4, max_length=16)


@router.get("/code")
def get_my_code(user: dict = Depends(get_current_user)) -> Any:
    code = ensure_user_referral_code(user["sub"])
    return {
        "code": code,
        "share_url": f"{FRONTEND_URL}/register?ref={code}",
    }


@router.get("/stats")
def get_referral_stats(user: dict = Depends(get_current_user)) -> Any:
    rows = get_referrals_for_referrer(user["sub"])
    converted = [r for r in rows if r["status"] == "converted"]
    return {
        "total_invited": len(rows),
        "converted_count": len(converted),
        "pending_count": len(rows) - len(converted),
        "months_earned": len(converted),  # 1 month per converted referee
        "invitees": [
            {
                "email": _mask_email(r.get("referee_email") or ""),
                "display_name": r.get("referee_display_name"),
                "status": r["status"],
                "created_at": r["created_at"],
                "reward_applied_at": r.get("reward_applied_at"),
            }
            for r in rows
        ],
    }


@router.post("/redeem")
def redeem_code(req: RedeemRequest, user: dict = Depends(get_current_user)) -> Any:
    referrer = get_user_by_referral_code(req.code)
    if not referrer:
        raise HTTPException(status_code=404, detail="Code de parrainage inconnu.")
    if referrer["id"] == user["sub"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas utiliser votre propre code.")

    me = get_user_by_id(user["sub"])
    if not me:
        raise HTTPException(status_code=404, detail="User not found.")

    ok = record_referral(referrer_id=referrer["id"], referee_id=user["sub"])
    if not ok:
        raise HTTPException(status_code=409, detail="Vous êtes déjà parrainé.")
    return {"status": "registered", "referrer": _mask_email(referrer["email"])}


def _mask_email(email: str) -> str:
    if "@" not in email:
        return email
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked}@{domain}"
