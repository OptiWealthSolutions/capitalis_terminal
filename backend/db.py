"""
User and subscription persistence.
Dev: SQLite at data/users.db
Prod: PostgreSQL via DATABASE_URL env var (set by Railway)
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .database import db_context, USE_PG

DB_PATH = Path(__file__).parent.parent / "data" / "users.db"


# ---------------------------------------------------------------------------
# Schema init
# ---------------------------------------------------------------------------

_DDL_USERS = """
    CREATE TABLE IF NOT EXISTS users (
        id                  TEXT PRIMARY KEY,
        email               TEXT UNIQUE NOT NULL,
        hashed_password     TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        stripe_customer_id  TEXT,
        display_name        TEXT,
        google_sub          TEXT UNIQUE,
        avatar_url          TEXT
    )
"""

_DDL_SUBSCRIPTIONS = """
    CREATE TABLE IF NOT EXISTS subscriptions (
        user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan                    TEXT NOT NULL DEFAULT 'free',
        status                  TEXT NOT NULL DEFAULT 'active',
        current_period_end      TEXT,
        cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
        stripe_subscription_id  TEXT
    )
"""


def init_db() -> None:
    with db_context(DB_PATH) as conn:
        conn.executescript(_DDL_USERS + "; " + _DDL_SUBSCRIPTIONS)
        if USE_PG:
            # ADD COLUMN IF NOT EXISTS supported in PostgreSQL 9.6+
            for col, ddl in (
                ("display_name", "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT"),
                ("google_sub",   "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT"),
                ("avatar_url",   "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT"),
            ):
                conn.execute(ddl)
        else:
            # SQLite: check PRAGMA before ALTER
            import sqlite3 as _sq3
            with _sq3.connect(str(DB_PATH)) as raw:
                raw.row_factory = _sq3.Row
                for col, ddl in (
                    ("display_name", "ALTER TABLE users ADD COLUMN display_name TEXT"),
                    ("google_sub",   "ALTER TABLE users ADD COLUMN google_sub TEXT"),
                    ("avatar_url",   "ALTER TABLE users ADD COLUMN avatar_url TEXT"),
                ):
                    existing = [r["name"] for r in raw.execute("PRAGMA table_info(users)").fetchall()]
                    if col not in existing:
                        raw.execute(ddl)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def create_user(
    email: str,
    hashed_password: str,
    display_name: str | None = None,
    google_sub: str | None = None,
    avatar_url: str | None = None,
) -> dict:
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO users
                   (id, email, hashed_password, created_at, display_name, google_sub, avatar_url)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, email, hashed_password, now, display_name, google_sub, avatar_url),
        )
        conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status) VALUES (?, 'free', 'active')",
            (user_id,),
        )
    return {"id": user_id, "email": email, "created_at": now}


def get_user_by_email(email: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()


def get_user_by_id(user_id: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def get_user_by_stripe_customer(customer_id: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE stripe_customer_id = ?", (customer_id,)
        ).fetchone()


def get_user_by_google_sub(google_sub: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
        ).fetchone()


def update_password(user_id: str, hashed_password: str) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            "UPDATE users SET hashed_password = ? WHERE id = ?",
            (hashed_password, user_id),
        )


def update_display_name(user_id: str, display_name: str) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            "UPDATE users SET display_name = ? WHERE id = ?",
            (display_name, user_id),
        )


def update_google_sub(user_id: str, google_sub: str, avatar_url: str | None = None) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            "UPDATE users SET google_sub = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?",
            (google_sub, avatar_url, user_id),
        )


def set_stripe_customer(user_id: str, customer_id: str) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
            (customer_id, user_id),
        )


def delete_user(user_id: str) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute("DELETE FROM subscriptions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------

def get_subscription(user_id: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)
        ).fetchone()


def upsert_subscription(
    user_id: str,
    plan: str,
    status: str,
    stripe_subscription_id: str,
    current_period_end: Optional[str] = None,
    cancel_at_period_end: bool = False,
) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO subscriptions
                (user_id, plan, status, stripe_subscription_id, current_period_end, cancel_at_period_end)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                plan                    = excluded.plan,
                status                  = excluded.status,
                stripe_subscription_id  = excluded.stripe_subscription_id,
                current_period_end      = excluded.current_period_end,
                cancel_at_period_end    = excluded.cancel_at_period_end
            """,
            (
                user_id, plan, status, stripe_subscription_id,
                current_period_end, int(cancel_at_period_end),
            ),
        )


def downgrade_to_free(user_id: str) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            """
            UPDATE subscriptions
            SET plan = 'free', status = 'cancelled',
                stripe_subscription_id = NULL, current_period_end = NULL,
                cancel_at_period_end = 0
            WHERE user_id = ?
            """,
            (user_id,),
        )


def set_cancel_at_period_end(user_id: str, flag: bool) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute(
            "UPDATE subscriptions SET cancel_at_period_end = ? WHERE user_id = ?",
            (int(flag), user_id),
        )
