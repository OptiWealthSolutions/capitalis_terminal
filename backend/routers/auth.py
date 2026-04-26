"""
Authentication router.

POST /auth/register        — create account, return token pair
POST /auth/login           — verify credentials, return token pair
POST /auth/google          — Google OAuth: verify id_token, login/create user
POST /auth/refresh         — exchange refresh token for new access token
GET  /auth/me              — current user profile + subscription + plan limits
PATCH /auth/profile        — update display_name
POST /auth/change-password — update password
DELETE /auth/account       — delete account (irreversible)
"""

import logging
import os
import secrets
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field

from ..auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..db import (
    create_user,
    delete_user,
    get_subscription,
    get_user_by_email,
    get_user_by_google_sub,
    get_user_by_id,
    has_redeemed_beta,
    redeem_beta_code,
    update_display_name,
    update_google_sub,
    update_password,
)
from ..plan_gate import get_limits, get_plan_for_user

logger = logging.getLogger(__name__)
router = APIRouter()

_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "")
_ALGORITHM = "HS256"

if not _SECRET_KEY:
    logger.critical("JWT_SECRET_KEY is not set — auth endpoints will reject all tokens")

# ---------------------------------------------------------------------------
# In-memory rate limiter for auth endpoints
# ---------------------------------------------------------------------------
_auth_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 300   # 5-minute sliding window
_RATE_MAX    = 10    # max 10 attempts per window per IP

def _rate_limit(request: Request) -> None:
    ip = (request.client.host if request.client else "unknown") or "unknown"
    now = time.monotonic()
    window = [t for t in _auth_attempts[ip] if now - t < _RATE_WINDOW]
    if len(window) >= _RATE_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Retry in {_RATE_WINDOW // 60} minutes.",
            headers={"Retry-After": str(_RATE_WINDOW)},
        )
    window.append(now)
    _auth_attempts[ip] = window


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=10)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(max_length=64)


class DeleteAccountRequest(BaseModel):
    password: str | None = None   # required for password-auth users, optional for Google-only


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _token_pair(user_id: str, email: str) -> dict:
    return {
        "access_token": create_access_token(user_id, email),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, request: Request):
    _rate_limit(request)
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    if get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    user = create_user(req.email, hash_password(req.password))
    return _token_pair(user["id"], user["email"])


@router.post("/login")
def login(req: LoginRequest, request: Request):
    _rate_limit(request)
    user = get_user_by_email(req.email)
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )
    return _token_pair(user["id"], user["email"])


@router.post("/refresh")
def refresh(req: RefreshRequest):
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Refresh token invalid or expired.",
    )
    try:
        payload = jwt.decode(req.refresh_token, _SECRET_KEY, algorithms=[_ALGORITHM])
        if payload.get("type") != "refresh":
            raise invalid
        user_id: str = payload["sub"]
    except JWTError:
        raise invalid

    user = get_user_by_id(user_id)
    if not user:
        raise invalid
    return {
        "access_token": create_access_token(user["id"], user["email"]),
        "token_type": "bearer",
    }


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(req: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["sub"])
    if not user or not verify_password(req.current_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password incorrect.")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    update_password(user["id"], hash_password(req.new_password))


@router.patch("/profile")
def patch_profile(req: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    update_display_name(user["id"], req.display_name.strip())
    return {"status": "updated", "display_name": req.display_name.strip()}


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(req: DeleteAccountRequest, current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    # Password verification required unless account is Google-only
    is_google_only = bool(user["google_sub"]) and (not user["hashed_password"] or user["hashed_password"].startswith("GOOGLE_ONLY_"))
    if not is_google_only:
        if not req.password or not verify_password(req.password, user["hashed_password"]):
            raise HTTPException(status_code=400, detail="Password verification failed.")
    delete_user(user["id"])


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------
_GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")


@router.post("/google")
def google_login(req: GoogleLoginRequest):
    """
    Accepts a Google ID token (from the frontend Google Identity Services),
    verifies it, and either logs in an existing user or creates a new one.
    """
    if not _GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID in backend .env.",
        )
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="google-auth package not installed. Run: pip install google-auth",
        )

    try:
        claims = google_id_token.verify_oauth2_token(
            req.id_token, google_requests.Request(), _GOOGLE_CLIENT_ID
        )
    except ValueError as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Google token.")

    google_sub = claims.get("sub")
    email = claims.get("email")
    email_verified = claims.get("email_verified", False)
    name = claims.get("name") or ""
    picture = claims.get("picture")

    if not google_sub or not email or not email_verified:
        raise HTTPException(status_code=400, detail="Google account email not verified.")

    # 1) Existing Google-linked user → log in
    user = get_user_by_google_sub(google_sub)
    if user:
        return _token_pair(user["id"], user["email"])

    # 2) Existing email user → link Google sub
    user = get_user_by_email(email)
    if user:
        update_google_sub(user["id"], google_sub, picture)
        return _token_pair(user["id"], user["email"])

    # 3) New user — create with random password (never used; login via Google only)
    random_pwd = hash_password(secrets.token_urlsafe(32))
    # Mark as google-only to allow account deletion without password
    random_pwd = "GOOGLE_ONLY_" + random_pwd
    user = create_user(
        email=email,
        hashed_password=random_pwd,
        display_name=name,
        google_sub=google_sub,
        avatar_url=picture,
    )
    return _token_pair(user["id"], user["email"])


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    sub = get_subscription(user["id"])
    plan = get_plan_for_user(user["id"])
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"] or "",
        "avatar_url": user["avatar_url"],
        "auth_provider": "google" if user["google_sub"] else "password",
        "created_at": user["created_at"],
        "subscription": {
            "plan": sub["plan"],
            "status": sub["status"],
            "current_period_end": sub["current_period_end"],
            "cancel_at_period_end": bool(sub["cancel_at_period_end"]),
        } if sub else {"plan": "free", "status": "active", "current_period_end": None, "cancel_at_period_end": False},
        "plan_limits": get_limits(plan),
    }


# ---------------------------------------------------------------------------
# Beta code redemption
# ---------------------------------------------------------------------------

_BETA_CODES: set[str] = {
    c.strip().upper()
    for c in os.environ.get("BETA_CODES", "").split(",")
    if c.strip()
}


class RedeemBetaRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=64)


@router.post("/redeem-beta")
def redeem_beta(req: RedeemBetaRequest, current_user: dict = Depends(get_current_user)):
    code = req.code.strip().upper()

    if not _BETA_CODES:
        raise HTTPException(status_code=503, detail="Beta program not active.")

    if code not in _BETA_CODES:
        raise HTTPException(status_code=400, detail="Invalid beta code.")

    if has_redeemed_beta(current_user["sub"]):
        raise HTTPException(status_code=409, detail="Beta code already redeemed on this account.")

    redeem_beta_code(current_user["sub"], code)
    return {"message": "Beta access activated. Institutional plan active for 30 days."}
