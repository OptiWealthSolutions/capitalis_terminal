"""
Pydantic schemas for Portfolio endpoints.
Strict validation prevents injection through ticker symbols.
"""

import re
from typing import Optional
from pydantic import BaseModel, Field, field_validator


TICKER_RE = re.compile(r"^[A-Z0-9.\-\^=]{1,12}$")


def _validate_ticker(v: str) -> str:
    v = v.strip().upper()
    if not TICKER_RE.match(v):
        raise ValueError(f"Invalid ticker format: {v!r}")
    return v


class OptimizationRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=2, max_length=50)
    method: str = Field(..., pattern=r"^(Markowitz|HRP|Max_Sharpe|Min_Vol|Risk_Parity)$")
    capital: float = Field(..., gt=0, le=1_000_000_000)
    min_weight: float = Field(default=0.01, ge=0.0, le=1.0)
    max_weight: float = Field(default=0.40, ge=0.0, le=1.0)
    risk_aversion: float = Field(default=1.0, ge=0.1, le=10.0)

    @field_validator("tickers", mode="before")
    @classmethod
    def validate_tickers(cls, v: list[str]) -> list[str]:
        return [_validate_ticker(t) for t in v]


class MonteCarloRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=50)
    weights: list[float] = Field(..., min_length=1, max_length=50)
    capital: float = Field(..., gt=0)
    n_simulations: int = Field(default=1000, ge=100, le=10000)
    horizon_days: int = Field(default=252, ge=21, le=1260)

    @field_validator("tickers", mode="before")
    @classmethod
    def validate_tickers(cls, v: list[str]) -> list[str]:
        return [_validate_ticker(t) for t in v]
