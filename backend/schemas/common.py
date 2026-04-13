"""
Shared Pydantic response schemas.
All response models inherit from BaseResponse for consistent API envelope.
"""

from pydantic import BaseModel, Field
from typing import Any, Optional


class BaseResponse(BaseModel):
    status: str = "ok"
    data: Any = None


class ErrorResponse(BaseModel):
    status: str = "error"
    detail: str


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
