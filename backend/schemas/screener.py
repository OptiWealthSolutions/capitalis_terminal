"""
Pydantic schemas for Screener endpoints.
"""

from typing import Optional
from pydantic import BaseModel, Field


VALID_OPS = {">=", "<=", ">", "<", "=="}
VALID_METRICS = {
    "forwardPE", "trailingPE", "priceToBook", "dividendYield",
    "returnOnEquity", "currentRatio", "earningsGrowth", "debtToEquity",
    "revenueGrowth", "grossMargins", "operatingMargins", "profitMargins",
    "marketCap", "enterpriseToEbitda",
}


class ScreenerCriterion(BaseModel):
    op: str = Field(..., pattern=r"^(>=|<=|>|<|==)$")
    val: float


class ScreenerRunRequest(BaseModel):
    criteria: dict[str, ScreenerCriterion] = Field(default_factory=dict, max_length=20)

    def model_post_init(self, __context) -> None:
        invalid_keys = set(self.criteria.keys()) - VALID_METRICS
        if invalid_keys:
            raise ValueError(f"Invalid screening metrics: {invalid_keys}")


class PresetSaveRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\- ]+$")
    criteria: dict[str, ScreenerCriterion]
