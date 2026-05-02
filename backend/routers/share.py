"""
Portfolio sharing — public allocation links.

Privacy contract: shared payloads expose ONLY tickers + weights (%) + a label.
Never amounts in EUR, never user identity, never broker source.

Endpoints:
    POST   /share/portfolio           auth  - create share, returns id + url
    GET    /share/mine                auth  - list owner's shares
    DELETE /share/{share_id}          auth  - owner-only delete
    GET    /share/public/{share_id}   public- sanitized payload (no auth)
"""

import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth.jwt_handler import get_current_user
from ..database import db_context

ROOT = Path(__file__).resolve().parent.parent.parent
_PF_DB_PATH = ROOT / "data" / "portfolios_v2.db"
FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Schema init
# ---------------------------------------------------------------------------

def _init_share_db() -> None:
    with db_context(_PF_DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS shared_allocations (
                id          TEXT PRIMARY KEY,
                owner_id    TEXT NOT NULL,
                label       TEXT NOT NULL,
                tickers     TEXT NOT NULL,
                weights     TEXT NOT NULL,
                method      TEXT,
                view_count  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_shared_owner
                ON shared_allocations(owner_id);
        """)


_init_share_db()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateShareRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    tickers: list[str] = Field(min_length=1, max_length=200)
    weights: list[float] = Field(min_length=1, max_length=200)
    method: str | None = None


class ShareResponse(BaseModel):
    id: str
    url: str
    label: str
    created_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_weights(weights: list[float]) -> list[float]:
    """Weights normalized to percentages summing to 100. Strips negatives."""
    cleaned = [max(0.0, float(w)) for w in weights]
    total = sum(cleaned)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Weights sum to zero.")
    return [round(w / total * 100, 2) for w in cleaned]


def _new_share_id() -> str:
    return secrets.token_urlsafe(9)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/portfolio", response_model=ShareResponse)
def create_share(req: CreateShareRequest, user: dict = Depends(get_current_user)) -> Any:
    if len(req.tickers) != len(req.weights):
        raise HTTPException(status_code=400, detail="tickers and weights length mismatch.")

    tickers_clean = [t.strip().upper() for t in req.tickers if t.strip()]
    if not tickers_clean:
        raise HTTPException(status_code=400, detail="No valid tickers.")

    weights_pct = _normalize_weights(req.weights[: len(tickers_clean)])
    share_id = _new_share_id()
    now = datetime.now(timezone.utc).isoformat()

    try:
        with db_context(_PF_DB_PATH) as conn:
            conn.execute(
                """INSERT INTO shared_allocations
                   (id, owner_id, label, tickers, weights, method, view_count, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
                (share_id, user["sub"], req.label.strip(),
                 json.dumps(tickers_clean), json.dumps(weights_pct),
                 req.method, now),
            )
    except Exception as exc:
        logger.error("share create failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create share.")

    return ShareResponse(
        id=share_id,
        url=f"{FRONTEND_URL}/share/{share_id}",
        label=req.label.strip(),
        created_at=now,
    )


@router.get("/mine")
def list_my_shares(user: dict = Depends(get_current_user)) -> Any:
    with db_context(_PF_DB_PATH) as conn:
        rows = conn.execute(
            """SELECT id, label, tickers, weights, method, view_count, created_at
               FROM shared_allocations
               WHERE owner_id = ?
               ORDER BY created_at DESC""",
            (user["sub"],),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "url": f"{FRONTEND_URL}/share/{r['id']}",
            "label": r["label"],
            "tickers": json.loads(r["tickers"]),
            "weights": json.loads(r["weights"]),
            "method": r["method"],
            "view_count": r["view_count"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.delete("/{share_id}")
def delete_share(share_id: str, user: dict = Depends(get_current_user)) -> Any:
    with db_context(_PF_DB_PATH) as conn:
        cur = conn.execute(
            "DELETE FROM shared_allocations WHERE id = ? AND owner_id = ?",
            (share_id, user["sub"]),
        )
        if (cur.rowcount or 0) == 0:
            raise HTTPException(status_code=404, detail="Share not found.")
    return {"status": "deleted", "id": share_id}


@router.get("/public/{share_id}")
def get_public_share(share_id: str) -> Any:
    """Public — no auth. Returns sanitized allocation only."""
    with db_context(_PF_DB_PATH) as conn:
        row = conn.execute(
            """SELECT id, label, tickers, weights, method, created_at
               FROM shared_allocations WHERE id = ?""",
            (share_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Share not found.")
        conn.execute(
            "UPDATE shared_allocations SET view_count = view_count + 1 WHERE id = ?",
            (share_id,),
        )

    return {
        "id": row["id"],
        "label": row["label"],
        "tickers": json.loads(row["tickers"]),
        "weights": json.loads(row["weights"]),
        "method": row["method"],
        "created_at": row["created_at"],
    }
