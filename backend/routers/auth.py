"""
Authentication router.

POST /auth/register  — create account, return token pair
POST /auth/login     — verify credentials, return token pair
POST /auth/refresh   — exchange refresh token for new access token
GET  /auth/me        — current user profile + subscription
"""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

from ..auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..db import (
    create_user,
    get_subscription,
    get_user_by_email,
    get_user_by_id,
    update_password,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "")
_ALGORITHM = "HS256"


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
def register(req: RegisterRequest):
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    if get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    user = create_user(req.email, hash_password(req.password))
    return _token_pair(user["id"], user["email"])


@router.post("/login")
def login(req: LoginRequest):
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


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    sub = get_subscription(user["id"])
    return {
        "id": user["id"],
        "email": user["email"],
        "created_at": user["created_at"],
        "subscription": {
            "plan": sub["plan"],
            "status": sub["status"],
            "current_period_end": sub["current_period_end"],
            "cancel_at_period_end": bool(sub["cancel_at_period_end"]),
        } if sub else {"plan": "free", "status": "active", "current_period_end": None, "cancel_at_period_end": False},
    }
