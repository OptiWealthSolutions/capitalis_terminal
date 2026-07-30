"""
Community router — polls + user posts feed.

GET  /community/polls                    — active polls + user vote
POST /community/polls/{id}/vote          — cast/change vote
GET  /community/posts                    — paginated feed
POST /community/posts                    — create post
DELETE /community/posts/{id}             — delete own post (admin: any)
POST /community/posts/{id}/upvote        — toggle upvote
POST /admin/polls                        — admin: create poll
PATCH /admin/polls/{id}/deactivate       — admin: deactivate poll
"""

import logging
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl

from ..auth.jwt_handler import get_current_user
from ..db import (
    cast_vote,
    create_poll,
    create_post,
    deactivate_poll,
    delete_post,
    get_active_polls,
    get_posts,
    toggle_upvote,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _is_admin(user: dict) -> bool:
    email = (user.get("email") or "").lower()
    return bool(_ADMIN_EMAILS) and email in _ADMIN_EMAILS


def _validate_url(url: str | None, field: str) -> str | None:
    if url is None or url.strip() == "":
        return None
    url = url.strip()
    if not _URL_RE.match(url):
        raise HTTPException(status_code=422, detail=f"{field} must start with http:// or https://")
    if len(url) > 2048:
        raise HTTPException(status_code=422, detail=f"{field} too long.")
    return url


# ---------------------------------------------------------------------------
# Polls
# ---------------------------------------------------------------------------

@router.get("/polls")
def list_polls(current_user: dict = Depends(get_current_user)):
    return {"polls": get_active_polls(user_id=current_user["sub"])}


class VoteRequest(BaseModel):
    option_id: str = Field(min_length=1)


@router.post("/polls/{poll_id}/vote")
def vote(poll_id: str, req: VoteRequest, current_user: dict = Depends(get_current_user)):
    ok = cast_vote(poll_id, req.option_id, current_user["sub"])
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid poll or option.")
    polls = get_active_polls(user_id=current_user["sub"])
    poll = next((p for p in polls if p["id"] == poll_id), None)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found.")
    return poll


# ---------------------------------------------------------------------------
# Posts feed
# ---------------------------------------------------------------------------

@router.get("/posts")
def list_posts(
    limit:  int    = Query(default=20, ge=1, le=50),
    offset: int    = Query(default=0, ge=0),
    ticker: str | None = Query(default=None, max_length=10),
    current_user: dict = Depends(get_current_user),
):
    posts = get_posts(limit=limit, offset=offset, ticker=ticker, user_id_ctx=current_user["sub"])
    return {"posts": posts, "offset": offset, "limit": limit}


class CreatePostRequest(BaseModel):
    content:   str       = Field(min_length=1, max_length=2000)
    link_url:  str | None = Field(default=None, max_length=2048)
    image_url: str | None = Field(default=None, max_length=2048)
    ticker:    str | None = Field(default=None, max_length=10)


@router.post("/posts", status_code=status.HTTP_201_CREATED)
def create_community_post(req: CreatePostRequest, current_user: dict = Depends(get_current_user)):
    link  = _validate_url(req.link_url,  "link_url")
    image = _validate_url(req.image_url, "image_url")
    ticker = req.ticker.strip().upper()[:10] if req.ticker else None
    post = create_post(
        user_id=current_user["sub"],
        content=req.content.strip(),
        link_url=link,
        image_url=image,
        ticker=ticker,
    )
    return post


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_post(post_id: str, current_user: dict = Depends(get_current_user)):
    is_admin = _is_admin(current_user)
    deleted = delete_post(post_id, current_user["sub"], is_admin=is_admin)
    if not deleted:
        raise HTTPException(status_code=404, detail="Post not found or not yours.")


@router.post("/posts/{post_id}/upvote")
def upvote_post(post_id: str, current_user: dict = Depends(get_current_user)):
    return toggle_upvote(post_id, current_user["sub"])


# ---------------------------------------------------------------------------
# Polls — creation (any authenticated user)
# ---------------------------------------------------------------------------

class CreatePollRequest(BaseModel):
    question:   str        = Field(min_length=5, max_length=500)
    options:    list[str]  = Field(min_length=2, max_length=6)
    expires_at: str | None = Field(default=None)  # ISO8601


def _make_poll(req: CreatePollRequest, user_id: str) -> dict:
    if any(len(o.strip()) == 0 for o in req.options):
        raise HTTPException(status_code=422, detail="Option text cannot be empty.")
    options = [o.strip()[:200] for o in req.options]
    return create_poll(
        question=req.question.strip(),
        options=options,
        created_by=user_id,
        expires_at=req.expires_at,
    )


@router.post("/polls", status_code=status.HTTP_201_CREATED)
def user_create_poll(req: CreatePollRequest, current_user: dict = Depends(get_current_user)):
    """Any authenticated user can create a poll."""
    return _make_poll(req, current_user["sub"])


# ---------------------------------------------------------------------------
# Admin — poll management (legacy + deactivate)
# ---------------------------------------------------------------------------

@router.post("/admin/polls", status_code=status.HTTP_201_CREATED)
def admin_create_poll(req: CreatePollRequest, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return _make_poll(req, current_user["sub"])


@router.patch("/admin/polls/{poll_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def admin_deactivate_poll(poll_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required.")
    deactivate_poll(poll_id)


# ---------------------------------------------------------------------------
# GET /community/leaderboard
# Real performance ranking from user tracker portfolios.
# Computes total return since entry (current value vs cost basis).
# Cached 30 min — recomputation cost dominated by yfinance batch fetch.
# ---------------------------------------------------------------------------
@router.get("/leaderboard")
def get_leaderboard(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    import json as _json
    import sqlite3 as _sq3
    from pathlib import Path as _P
    import yfinance as _yf
    import numpy as _np

    from ..cache.memory_cache import cache as _cache

    cache_key = f"leaderboard:totalret:{limit}"
    cached = _cache.get(cache_key)

    if cached is None:
        ROOT = _P(__file__).resolve().parent.parent.parent
        tracker_db = ROOT / "data" / "tracker_v2.db"
        users_db   = ROOT / "data" / "users.db"

        rows: list[dict] = []
        try:
            with _sq3.connect(str(tracker_db)) as tconn:
                tconn.row_factory = _sq3.Row
                trk_rows = tconn.execute(
                    "SELECT user_id, name, data, created_at FROM tracker_portfolios ORDER BY created_at DESC"
                ).fetchall()
        except Exception as e:
            logger.warning("tracker_db read failed: %s", e)
            trk_rows = []

        try:
            with _sq3.connect(str(users_db)) as uconn:
                uconn.row_factory = _sq3.Row
                user_rows = uconn.execute(
                    "SELECT id, email, display_name, avatar_url FROM users"
                ).fetchall()
            users_by_id = {r["id"]: dict(r) for r in user_rows}
        except Exception as e:
            logger.warning("users_db read failed: %s", e)
            users_by_id = {}

        # Pick latest portfolio per user
        latest: dict[str, dict] = {}
        for r in trk_rows:
            uid = r["user_id"]
            if uid in latest:
                continue
            try:
                payload = _json.loads(r["data"])
                positions = payload.get("positions") or []
                if positions:
                    latest[uid] = {"name": r["name"], "positions": positions}
            except Exception:
                continue

        all_tickers = sorted({(p.get("ticker") or "").upper().strip()
                              for d in latest.values() for p in d["positions"]
                              if p.get("ticker")})

        prices: dict[str, float] = {}
        if all_tickers:
            try:
                # Batch fetch last 5d closes, take last
                hist = _yf.download(
                    tickers=all_tickers, period="5d", progress=False, auto_adjust=True,
                )
                if hist is not None and not hist.empty:
                    closes = hist["Close"] if "Close" in getattr(hist, "columns", []) else hist
                    if hasattr(closes, "iloc"):
                        last = closes.iloc[-1]
                        if hasattr(last, "items"):
                            for tk, v in last.items():
                                try:
                                    f = float(v)
                                    if not _np.isnan(f):
                                        prices[str(tk).upper()] = f
                                except Exception:
                                    continue
                        else:
                            try:
                                f = float(last)
                                if not _np.isnan(f):
                                    prices[all_tickers[0]] = f
                            except Exception:
                                pass
            except Exception as e:
                logger.warning("leaderboard price fetch failed: %s", e)

        # Compute total return per user
        leaderboard: list[dict] = []
        for uid, d in latest.items():
            cost = 0.0
            value = 0.0
            for p in d["positions"]:
                tk = (p.get("ticker") or "").upper().strip()
                shares = float(p.get("shares") or 0)
                entry  = float(p.get("entry_price") or 0)
                if not tk or shares <= 0 or entry <= 0:
                    continue
                last_px = prices.get(tk)
                if last_px is None:
                    continue
                cost += shares * entry
                value += shares * last_px
            if cost <= 0:
                continue
            ret_pct = (value - cost) / cost * 100.0
            u = users_by_id.get(uid, {})
            handle = u.get("display_name") or (u.get("email") or "").split("@")[0] or uid[:8]
            leaderboard.append({
                "user_id":      uid,
                "display_name": handle,
                "avatar_url":   u.get("avatar_url"),
                "return_pct":   round(ret_pct, 2),
                "cost":         round(cost, 2),
                "value":        round(value, 2),
                "positions_count": len([1 for p in d["positions"]
                                        if (p.get("ticker") or "").upper() in prices]),
            })

        leaderboard.sort(key=lambda x: x["return_pct"], reverse=True)
        for i, row in enumerate(leaderboard, 1):
            row["rank"] = i

        cached = {"leaderboard": leaderboard, "total_users": len(leaderboard)}
        _cache.set(cache_key, cached, ttl=1800)

    full = cached["leaderboard"]
    total_users = cached["total_users"]

    me_row = next((r for r in full if r["user_id"] == current_user["sub"]), None)
    me_rank = me_row["rank"] if me_row else None
    percentile = None
    if me_rank is not None and total_users > 1:
        percentile = round((1 - (me_rank - 1) / total_users) * 100)

    return {
        "top":         full[:limit],
        "me":          me_row,
        "me_rank":     me_rank,
        "me_percentile": percentile,
        "total_users": total_users,
    }
