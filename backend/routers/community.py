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
