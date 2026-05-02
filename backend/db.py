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
        avatar_url          TEXT,
        referral_code       TEXT UNIQUE
    )
"""

_DDL_REFERRALS = """
    CREATE TABLE IF NOT EXISTS referrals (
        id                 TEXT PRIMARY KEY,
        referrer_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referee_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status             TEXT NOT NULL DEFAULT 'pending',
        reward_applied_at  TEXT,
        created_at         TEXT NOT NULL,
        UNIQUE(referee_id)
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

_DDL_BETA_REDEMPTIONS = """
    CREATE TABLE IF NOT EXISTS beta_redemptions (
        code        TEXT NOT NULL,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redeemed_at TEXT NOT NULL,
        PRIMARY KEY (code, user_id)
    )
"""

_DDL_ALERTS = """
    CREATE TABLE IF NOT EXISTS alerts (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticker       TEXT NOT NULL,
        alert_type   TEXT NOT NULL,
        price        REAL,
        days_before  INTEGER,
        note         TEXT,
        is_active    INTEGER NOT NULL DEFAULT 1,
        triggered_at TEXT,
        created_at   TEXT NOT NULL
    )
"""


_DDL_POLLS = """
    CREATE TABLE IF NOT EXISTS polls (
        id          TEXT PRIMARY KEY,
        question    TEXT NOT NULL,
        created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL,
        expires_at  TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1
    )
"""

_DDL_POLL_OPTIONS = """
    CREATE TABLE IF NOT EXISTS poll_options (
        id       TEXT PRIMARY KEY,
        poll_id  TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        text     TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
    )
"""

_DDL_POLL_VOTES = """
    CREATE TABLE IF NOT EXISTS poll_votes (
        id         TEXT PRIMARY KEY,
        poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        option_id  TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE(poll_id, user_id)
    )
"""

_DDL_COMMUNITY_POSTS = """
    CREATE TABLE IF NOT EXISTS community_posts (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        link_url   TEXT,
        image_url  TEXT,
        ticker     TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
"""

_DDL_POST_UPVOTES = """
    CREATE TABLE IF NOT EXISTS post_upvotes (
        id         TEXT PRIMARY KEY,
        post_id    TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE(post_id, user_id)
    )
"""


def init_db() -> None:
    with db_context(DB_PATH) as conn:
        conn.executescript(
            _DDL_USERS + "; " + _DDL_SUBSCRIPTIONS + "; " +
            _DDL_BETA_REDEMPTIONS + "; " + _DDL_ALERTS + "; " +
            _DDL_POLLS + "; " + _DDL_POLL_OPTIONS + "; " + _DDL_POLL_VOTES + "; " +
            _DDL_COMMUNITY_POSTS + "; " + _DDL_POST_UPVOTES + "; " +
            _DDL_REFERRALS
        )
        if USE_PG:
            # ADD COLUMN IF NOT EXISTS supported in PostgreSQL 9.6+
            for col, ddl in (
                ("display_name",   "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT"),
                ("google_sub",     "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT"),
                ("avatar_url",     "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT"),
                ("referral_code",  "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT"),
            ):
                conn.execute(ddl)
        else:
            # SQLite: check PRAGMA before ALTER
            import sqlite3 as _sq3
            with _sq3.connect(str(DB_PATH)) as raw:
                raw.row_factory = _sq3.Row
                for col, ddl in (
                    ("display_name",   "ALTER TABLE users ADD COLUMN display_name TEXT"),
                    ("google_sub",     "ALTER TABLE users ADD COLUMN google_sub TEXT"),
                    ("avatar_url",     "ALTER TABLE users ADD COLUMN avatar_url TEXT"),
                    ("referral_code",  "ALTER TABLE users ADD COLUMN referral_code TEXT"),
                ):
                    existing = [r["name"] for r in raw.execute("PRAGMA table_info(users)").fetchall()]
                    if col not in existing:
                        raw.execute(ddl)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def _generate_referral_code() -> str:
    """8-char alphanumeric, base32-style without confusable chars."""
    import secrets
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def create_user(
    email: str,
    hashed_password: str,
    display_name: str | None = None,
    google_sub: str | None = None,
    avatar_url: str | None = None,
) -> dict:
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    referral_code = _generate_referral_code()
    with db_context(DB_PATH) as conn:
        # Retry up to 5x in case of code collision
        for _ in range(5):
            try:
                conn.execute(
                    """INSERT INTO users
                           (id, email, hashed_password, created_at, display_name,
                            google_sub, avatar_url, referral_code)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (user_id, email, hashed_password, now, display_name,
                     google_sub, avatar_url, referral_code),
                )
                break
            except Exception as exc:
                if "referral_code" in str(exc).lower():
                    referral_code = _generate_referral_code()
                    continue
                raise
        conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status) VALUES (?, 'free', 'active')",
            (user_id,),
        )
    return {"id": user_id, "email": email, "created_at": now, "referral_code": referral_code}


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------

def get_user_by_referral_code(code: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE referral_code = ?", (code.upper(),)
        ).fetchone()


def ensure_user_referral_code(user_id: str) -> str:
    """Returns existing referral_code or generates one for legacy users."""
    user = get_user_by_id(user_id)
    if user and user["referral_code"]:
        return user["referral_code"]
    code = _generate_referral_code()
    with db_context(DB_PATH) as conn:
        for _ in range(5):
            try:
                conn.execute(
                    "UPDATE users SET referral_code = ? WHERE id = ?",
                    (code, user_id),
                )
                return code
            except Exception:
                code = _generate_referral_code()
    return code


def record_referral(referrer_id: str, referee_id: str) -> bool:
    """Records a pending referral. No-op if referee already attributed."""
    if referrer_id == referee_id:
        return False
    referral_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        existing = conn.execute(
            "SELECT id FROM referrals WHERE referee_id = ?", (referee_id,)
        ).fetchone()
        if existing:
            return False
        conn.execute(
            """INSERT INTO referrals (id, referrer_id, referee_id, status, created_at)
               VALUES (?, ?, ?, 'pending', ?)""",
            (referral_id, referrer_id, referee_id, now),
        )
    return True


def get_referral_for_referee(referee_id: str):
    with db_context(DB_PATH) as conn:
        return conn.execute(
            "SELECT * FROM referrals WHERE referee_id = ?", (referee_id,)
        ).fetchone()


def get_referrals_for_referrer(referrer_id: str) -> list[dict]:
    with db_context(DB_PATH) as conn:
        rows = conn.execute(
            """SELECT r.*, u.email AS referee_email, u.display_name AS referee_display_name
               FROM referrals r
               JOIN users u ON u.id = r.referee_id
               WHERE r.referrer_id = ?
               ORDER BY r.created_at DESC""",
            (referrer_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_referral_converted(referee_id: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        cur = conn.execute(
            """UPDATE referrals
               SET status = 'converted', reward_applied_at = ?
               WHERE referee_id = ? AND status = 'pending'""",
            (now, referee_id),
        )
        return (cur.rowcount or 0) > 0


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


# ---------------------------------------------------------------------------
# Beta code redemption
# ---------------------------------------------------------------------------

def has_redeemed_beta(user_id: str) -> bool:
    """True if user already redeemed any beta code."""
    with db_context(DB_PATH) as conn:
        row = conn.execute(
            "SELECT code FROM beta_redemptions WHERE user_id = ?", (user_id,)
        ).fetchone()
        return row is not None


def redeem_beta_code(user_id: str, code: str) -> None:
    """Record redemption + upgrade user to institutional for 30 days."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    period_end = (now + timedelta(days=30)).isoformat()
    with db_context(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO beta_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)",
            (code.upper(), user_id, now.isoformat()),
        )
        conn.execute(
            """
            INSERT INTO subscriptions
                (user_id, plan, status, current_period_end, cancel_at_period_end, stripe_subscription_id)
            VALUES (?, 'institutional', 'active', ?, 0, NULL)
            ON CONFLICT(user_id) DO UPDATE SET
                plan               = 'institutional',
                status             = 'active',
                current_period_end = ?,
                cancel_at_period_end = 0,
                stripe_subscription_id = NULL
            """,
            (user_id, period_end, period_end),
        )


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

def create_alert(
    user_id: str,
    ticker: str,
    alert_type: str,
    price: float | None = None,
    days_before: int | None = None,
    note: str | None = None,
) -> dict:
    alert_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO alerts (id, user_id, ticker, alert_type, price, days_before, note, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
            (alert_id, user_id, ticker.upper(), alert_type, price, days_before, note, now),
        )
    return {"id": alert_id, "ticker": ticker.upper(), "alert_type": alert_type,
            "price": price, "days_before": days_before, "note": note,
            "is_active": True, "triggered_at": None, "created_at": now}


def get_alerts_for_user(user_id: str) -> list[dict]:
    with db_context(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_all_active_alerts() -> list[dict]:
    with db_context(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT a.*, u.email FROM alerts a JOIN users u ON a.user_id = u.id WHERE a.is_active = 1 AND a.triggered_at IS NULL"
        ).fetchall()
    return [dict(r) for r in rows]


def update_alert(alert_id: str, user_id: str, **kwargs) -> bool:
    allowed = {"is_active", "price", "days_before", "note", "triggered_at"}
    sets = {k: v for k, v in kwargs.items() if k in allowed}
    if not sets:
        return False
    cols = ", ".join(f"{k} = ?" for k in sets)
    vals = list(sets.values()) + [alert_id, user_id]
    with db_context(DB_PATH) as conn:
        cur = conn.execute(f"UPDATE alerts SET {cols} WHERE id = ? AND user_id = ?", vals)
        return (cur.rowcount or 0) > 0


def delete_alert(alert_id: str, user_id: str) -> bool:
    with db_context(DB_PATH) as conn:
        cur = conn.execute("DELETE FROM alerts WHERE id = ? AND user_id = ?", (alert_id, user_id))
        return (cur.rowcount or 0) > 0


# ---------------------------------------------------------------------------
# Community — Polls
# ---------------------------------------------------------------------------

def create_poll(question: str, options: list[str], created_by: str, expires_at: str | None = None) -> dict:
    poll_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO polls (id, question, created_by, created_at, expires_at, is_active) VALUES (?, ?, ?, ?, ?, 1)",
            (poll_id, question, created_by, now, expires_at),
        )
        for i, text in enumerate(options):
            conn.execute(
                "INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), poll_id, text, i),
            )
    return {"id": poll_id}


def get_active_polls(user_id: str | None = None) -> list[dict]:
    with db_context(DB_PATH) as conn:
        polls = conn.execute(
            "SELECT * FROM polls WHERE is_active = 1 ORDER BY created_at DESC"
        ).fetchall()
        result = []
        for p in polls:
            options = conn.execute(
                "SELECT id, text, position FROM poll_options WHERE poll_id = ? ORDER BY position",
                (p["id"],),
            ).fetchall()
            vote_counts = {
                r["option_id"]: r["cnt"]
                for r in conn.execute(
                    "SELECT option_id, COUNT(*) AS cnt FROM poll_votes WHERE poll_id = ? GROUP BY option_id",
                    (p["id"],),
                ).fetchall()
            }
            total_votes = sum(vote_counts.values())
            user_vote = None
            if user_id:
                row = conn.execute(
                    "SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?",
                    (p["id"], user_id),
                ).fetchone()
                user_vote = row["option_id"] if row else None
            result.append({
                "id": p["id"],
                "question": p["question"],
                "created_at": p["created_at"],
                "expires_at": p["expires_at"],
                "total_votes": total_votes,
                "options": [
                    {
                        "id": o["id"],
                        "text": o["text"],
                        "votes": vote_counts.get(o["id"], 0),
                        "pct": round(vote_counts.get(o["id"], 0) / total_votes * 100, 1) if total_votes > 0 else 0,
                    }
                    for o in options
                ],
                "user_vote": user_vote,
            })
        return result


def cast_vote(poll_id: str, option_id: str, user_id: str) -> bool:
    """Returns True if vote cast, False if already voted."""
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        opt = conn.execute(
            "SELECT id FROM poll_options WHERE id = ? AND poll_id = ?", (option_id, poll_id)
        ).fetchone()
        if not opt:
            return False
        existing = conn.execute(
            "SELECT id FROM poll_votes WHERE poll_id = ? AND user_id = ?", (poll_id, user_id)
        ).fetchone()
        if existing:
            # Update vote (change mind)
            conn.execute(
                "UPDATE poll_votes SET option_id = ?, created_at = ? WHERE poll_id = ? AND user_id = ?",
                (option_id, now, poll_id, user_id),
            )
        else:
            conn.execute(
                "INSERT INTO poll_votes (id, poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), poll_id, option_id, user_id, now),
            )
        return True


def deactivate_poll(poll_id: str) -> None:
    with db_context(DB_PATH) as conn:
        conn.execute("UPDATE polls SET is_active = 0 WHERE id = ?", (poll_id,))


# ---------------------------------------------------------------------------
# Community — Posts
# ---------------------------------------------------------------------------

def create_post(user_id: str, content: str, link_url: str | None, image_url: str | None, ticker: str | None) -> dict:
    post_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO community_posts (id, user_id, content, link_url, image_url, ticker, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (post_id, user_id, content, link_url, image_url, ticker, now, now),
        )
    return {"id": post_id, "created_at": now}


def get_posts(limit: int = 30, offset: int = 0, ticker: str | None = None, user_id_ctx: str | None = None) -> list[dict]:
    with db_context(DB_PATH) as conn:
        query = """
            SELECT p.*, u.email, u.display_name, u.avatar_url,
                   (SELECT COUNT(*) FROM post_upvotes pu WHERE pu.post_id = p.id) AS upvotes
            FROM community_posts p
            JOIN users u ON u.id = p.user_id
        """
        params: list = []
        if ticker:
            query += " WHERE p.ticker = ?"
            params.append(ticker.upper())
        query += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
        params += [limit, offset]

        rows = conn.execute(query, params).fetchall()
        upvoted_set: set[str] = set()
        if user_id_ctx:
            up_rows = conn.execute(
                "SELECT post_id FROM post_upvotes WHERE user_id = ?", (user_id_ctx,)
            ).fetchall()
            upvoted_set = {r["post_id"] for r in up_rows}

        return [
            {
                "id": r["id"],
                "content": r["content"],
                "link_url": r["link_url"],
                "image_url": r["image_url"],
                "ticker": r["ticker"],
                "created_at": r["created_at"],
                "upvotes": r["upvotes"],
                "user_upvoted": r["id"] in upvoted_set,
                "author": {
                    "email": r["email"],
                    "display_name": r["display_name"],
                    "initials": (r["display_name"] or r["email"] or "?")[0].upper(),
                },
            }
            for r in rows
        ]


def toggle_upvote(post_id: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    with db_context(DB_PATH) as conn:
        existing = conn.execute(
            "SELECT id FROM post_upvotes WHERE post_id = ? AND user_id = ?", (post_id, user_id)
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM post_upvotes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
            upvoted = False
        else:
            conn.execute(
                "INSERT INTO post_upvotes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), post_id, user_id, now),
            )
            upvoted = True
        count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM post_upvotes WHERE post_id = ?", (post_id,)
        ).fetchone()["cnt"]
        return {"upvoted": upvoted, "upvotes": count}


def delete_post(post_id: str, user_id: str, is_admin: bool = False) -> bool:
    with db_context(DB_PATH) as conn:
        if is_admin:
            cur = conn.execute("DELETE FROM community_posts WHERE id = ?", (post_id,))
        else:
            cur = conn.execute("DELETE FROM community_posts WHERE id = ? AND user_id = ?", (post_id, user_id))
        return (cur.rowcount or 0) > 0
