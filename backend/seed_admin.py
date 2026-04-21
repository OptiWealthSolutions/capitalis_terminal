"""
Seed script — creates test accounts for every subscription tier.

Usage:
    python -m backend.seed_admin
    # or from project root:
    python backend/seed_admin.py

Accounts seeded:
    admin@capitalis.io / admin      → institutional (all features unlocked)
    pro@capitalis.io   / pro12345   → pro (3 portfolios, 3 methods)
    free@capitalis.io  / free12345  → free (1 portfolio, Equal Weights only)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.db import init_db, get_user_by_email, create_user, upsert_subscription, downgrade_to_free
from backend.auth.jwt_handler import hash_password


ACCOUNTS = [
    {
        "email":    "admin@capitalis.io",
        "password": "admin",
        "plan":     "institutional",
        "sub_id":   "admin_seed",
    },
    {
        "email":    "pro@capitalis.io",
        "password": "pro12345",
        "plan":     "pro",
        "sub_id":   "pro_seed",
    },
    {
        "email":    "free@capitalis.io",
        "password": "free12345",
        "plan":     "free",
        "sub_id":   None,     # no Stripe subscription for free plan
    },
]


def _apply_plan(user_id: str, plan: str, sub_id: str | None) -> None:
    if plan == "free":
        downgrade_to_free(user_id)
        return
    upsert_subscription(
        user_id=user_id,
        plan=plan,
        status="active",
        stripe_subscription_id=sub_id or "seed",
        current_period_end="2099-12-31T00:00:00+00:00",
        cancel_at_period_end=False,
    )


def seed():
    init_db()
    for acc in ACCOUNTS:
        existing = get_user_by_email(acc["email"])
        if existing:
            _apply_plan(existing["id"], acc["plan"], acc["sub_id"])
            print(f"[=] {acc['email']} exists → plan reset to '{acc['plan']}'.")
            continue
        user = create_user(acc["email"], hash_password(acc["password"]))
        _apply_plan(user["id"], acc["plan"], acc["sub_id"])
        print(f"[+] Created {acc['email']} / {acc['password']} → plan '{acc['plan']}'.")


if __name__ == "__main__":
    seed()
