"""
Broker import router — mocked Powens / Plaid flow.

Endpoints:
    POST /broker/providers           list available brokers
    POST /broker/link                start auth flow (returns link_token)
    POST /broker/exchange            exchange public_token, kicks off sync job
    GET  /broker/sync/{job_id}       poll sync progress (Magic Import bar)
    POST /broker/import/{job_id}     finalize: write holdings into tracker portfolio

The sync is fake: progress advances on each poll. Real Powens / Plaid wiring
will replace `_run_mock_sync` and `_MOCK_HOLDINGS` only.
"""

import json
import logging
import random
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth.jwt_handler import get_current_user
from ..database import db_context

ROOT = Path(__file__).resolve().parent.parent.parent
_TRACKER_DB_PATH = ROOT / "data" / "tracker_v2.db"

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Mock catalogue
# ---------------------------------------------------------------------------

_PROVIDERS = [
    {"id": "boursorama",     "name": "Boursorama",       "country": "FR", "logo": "BS"},
    {"id": "bourse_direct",  "name": "Bourse Direct",    "country": "FR", "logo": "BD"},
    {"id": "trade_republic", "name": "Trade Republic",   "country": "DE", "logo": "TR"},
    {"id": "degiro",         "name": "DEGIRO",           "country": "NL", "logo": "DG"},
    {"id": "ibkr",           "name": "Interactive Brokers","country": "US","logo": "IB"},
    {"id": "saxo",           "name": "Saxo Bank",        "country": "DK", "logo": "SX"},
    {"id": "fortuneo",       "name": "Fortuneo",         "country": "FR", "logo": "FO"},
    {"id": "binck",          "name": "BinckBank",        "country": "NL", "logo": "BK"},
]

_MOCK_HOLDINGS_POOL = [
    {"ticker": "AAPL",   "qty": 12, "avg_price": 178.50, "currency": "USD"},
    {"ticker": "MSFT",   "qty":  8, "avg_price": 410.20, "currency": "USD"},
    {"ticker": "NVDA",   "qty": 20, "avg_price": 480.00, "currency": "USD"},
    {"ticker": "GOOGL",  "qty": 15, "avg_price": 165.30, "currency": "USD"},
    {"ticker": "AMZN",   "qty": 10, "avg_price": 195.40, "currency": "USD"},
    {"ticker": "META",   "qty":  6, "avg_price": 520.00, "currency": "USD"},
    {"ticker": "MC.PA",  "qty":  5, "avg_price": 720.00, "currency": "EUR"},
    {"ticker": "AIR.PA", "qty": 15, "avg_price": 165.00, "currency": "EUR"},
    {"ticker": "ASML",   "qty":  3, "avg_price": 850.00, "currency": "EUR"},
    {"ticker": "OR.PA",  "qty":  8, "avg_price": 425.00, "currency": "EUR"},
    {"ticker": "SAN.PA", "qty": 25, "avg_price":  98.50, "currency": "EUR"},
    {"ticker": "VWCE.DE","qty": 50, "avg_price": 105.00, "currency": "EUR"},
    {"ticker": "CW8.PA", "qty": 20, "avg_price":  35.00, "currency": "EUR"},
    {"ticker": "GLD",    "qty": 10, "avg_price": 195.00, "currency": "USD"},
    {"ticker": "BTC-USD","qty":  0.25,"avg_price":42000.00,"currency": "USD"},
]


# ---------------------------------------------------------------------------
# In-memory job store — survives only one process. Fine for mock.
# ---------------------------------------------------------------------------

_JOBS: dict[str, dict[str, Any]] = {}

_STEPS = [
    "Connexion sécurisée au broker",
    "Authentification utilisateur",
    "Récupération des positions",
    "Mapping des tickers",
    "Calcul des prix de revient",
    "Synchronisation finale",
]


def _new_job(user_id: str, provider: str) -> dict[str, Any]:
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "user_id": user_id,
        "provider": provider,
        "status": "running",
        "progress": 0,
        "step_index": 0,
        "step": _STEPS[0],
        "started_at": time.time(),
        "holdings": random.sample(_MOCK_HOLDINGS_POOL, k=random.randint(6, 10)),
    }
    _JOBS[job_id] = job
    return job


def _advance(job: dict[str, Any]) -> dict[str, Any]:
    """Each poll bumps progress by 18-28 pts so total takes ~4-6 polls."""
    if job["status"] != "running":
        return job
    increment = random.randint(18, 28)
    job["progress"] = min(100, job["progress"] + increment)
    job["step_index"] = min(len(_STEPS) - 1,
                            int(job["progress"] / 100 * (len(_STEPS) - 1)))
    job["step"] = _STEPS[job["step_index"]]
    if job["progress"] >= 100:
        job["status"] = "ready"
        job["step"] = "Prêt à importer"
    return job


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class LinkRequest(BaseModel):
    provider: str


class ExchangeRequest(BaseModel):
    public_token: str
    provider: str


class ImportRequest(BaseModel):
    portfolio_name: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/providers")
def list_providers(user: dict = Depends(get_current_user)) -> Any:
    return _PROVIDERS


@router.post("/link")
def create_link_token(req: LinkRequest, user: dict = Depends(get_current_user)) -> Any:
    if req.provider not in {p["id"] for p in _PROVIDERS}:
        raise HTTPException(status_code=400, detail="Unknown provider.")
    return {
        "link_token": f"link_mock_{uuid.uuid4().hex[:16]}",
        "provider": req.provider,
        "expires_in": 900,
    }


@router.post("/exchange")
def exchange_public_token(req: ExchangeRequest, user: dict = Depends(get_current_user)) -> Any:
    if not req.public_token:
        raise HTTPException(status_code=400, detail="Missing public_token.")
    job = _new_job(user["sub"], req.provider)
    return {"job_id": job["id"], "status": job["status"], "progress": 0,
            "step": job["step"]}


@router.get("/sync/{job_id}")
def get_sync_status(job_id: str, user: dict = Depends(get_current_user)) -> Any:
    job = _JOBS.get(job_id)
    if not job or job["user_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Job not found.")
    _advance(job)
    return {
        "job_id": job["id"],
        "status": job["status"],
        "progress": job["progress"],
        "step": job["step"],
        "step_index": job["step_index"],
        "total_steps": len(_STEPS),
        "holdings_count": len(job["holdings"]) if job["status"] == "ready" else None,
        "provider": job["provider"],
    }


@router.post("/import/{job_id}")
def import_holdings(
    job_id: str,
    req: ImportRequest,
    user: dict = Depends(get_current_user),
) -> Any:
    job = _JOBS.get(job_id)
    if not job or job["user_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["status"] != "ready":
        raise HTTPException(status_code=409, detail="Sync not finished.")

    portfolio_id = str(uuid.uuid4())
    provider_label = next(
        (p["name"] for p in _PROVIDERS if p["id"] == job["provider"]),
        job["provider"].title(),
    )
    name = req.portfolio_name or f"{provider_label} import"
    today = datetime.now(timezone.utc).date().isoformat()
    positions = [
        {
            "id": str(uuid.uuid4()),
            "ticker": h["ticker"],
            "shares": h["qty"],
            "entry_price": h["avg_price"],
            "entry_date": today,
            "notes": f"Imported from {provider_label}",
        }
        for h in job["holdings"]
    ]

    payload = json.dumps({"positions": positions})
    try:
        with db_context(_TRACKER_DB_PATH) as conn:
            conn.execute(
                """INSERT INTO tracker_portfolios (id, user_id, name, data, created_at)
                   VALUES (?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(user_id, name) DO UPDATE SET
                       data = excluded.data,
                       created_at = excluded.created_at""",
                (portfolio_id, user["sub"], name, payload),
            )
    except Exception as exc:
        logger.error("broker import write failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to write portfolio.")

    job["status"] = "imported"
    return {
        "portfolio_id": portfolio_id,
        "name": name,
        "positions_count": len(positions),
        "provider": provider_label,
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }
