"""
Seed script — creates admin account for testing.

Usage:
    python -m backend.seed_admin
    # or from project root:
    python backend/seed_admin.py

Credentials:
    email:    admin@capitalis.io
    password: admin
    plan:     institutional (all features unlocked)
"""

import sys
from pathlib import Path

# Allow running as a standalone script from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.db import init_db, get_user_by_email, create_user, upsert_subscription
from backend.auth.jwt_handler import hash_password

ADMIN_EMAIL = "admin@capitalis.io"
ADMIN_PASSWORD = "admin"


def seed():
    init_db()

    existing = get_user_by_email(ADMIN_EMAIL)
    if existing:
        # Update subscription to institutional in case it was downgraded
        upsert_subscription(
            user_id=existing["id"],
            plan="institutional",
            status="active",
            stripe_subscription_id="admin_seed",
            current_period_end="2099-12-31T00:00:00+00:00",
            cancel_at_period_end=False,
        )
        print(f"Admin already exists — subscription reset to institutional. [{ADMIN_EMAIL}]")
        return

    user = create_user(ADMIN_EMAIL, hash_password(ADMIN_PASSWORD))
    upsert_subscription(
        user_id=user["id"],
        plan="institutional",
        status="active",
        stripe_subscription_id="admin_seed",
        current_period_end="2099-12-31T00:00:00+00:00",
        cancel_at_period_end=False,
    )
    print(f"Admin account created: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    seed()
