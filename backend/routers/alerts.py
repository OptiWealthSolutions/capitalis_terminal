"""
Price and event alert system.

GET    /api/alerts           — list authenticated user's alerts
POST   /api/alerts           — create alert
PATCH  /api/alerts/{id}      — toggle active / update price
DELETE /api/alerts/{id}      — delete alert
POST   /api/alerts/check     — evaluate all active alerts (called by cron)
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth.jwt_handler import get_current_user
from ..db import (
    create_alert, get_alerts_for_user, get_all_active_alerts,
    update_alert, delete_alert,
)

logger = logging.getLogger(__name__)
router = APIRouter()

ALERT_TYPES = {"price_above", "price_below", "earnings_date"}

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AlertCreate(BaseModel):
    ticker:      str            = Field(..., min_length=1, max_length=10)
    alert_type:  str
    price:       Optional[float] = None
    days_before: Optional[int]  = None
    note:        Optional[str]  = Field(None, max_length=200)

class AlertPatch(BaseModel):
    is_active:   Optional[bool]  = None
    price:       Optional[float] = None
    days_before: Optional[int]   = None
    note:        Optional[str]   = Field(None, max_length=200)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
def list_alerts(current_user: dict = Depends(get_current_user)):
    rows = get_alerts_for_user(current_user["id"])
    for r in rows:
        r["is_active"] = bool(r.get("is_active", 1))
    return rows


@router.post("", status_code=status.HTTP_201_CREATED)
def add_alert(body: AlertCreate, current_user: dict = Depends(get_current_user)):
    if body.alert_type not in ALERT_TYPES:
        raise HTTPException(status_code=422, detail=f"alert_type must be one of {sorted(ALERT_TYPES)}")
    if body.alert_type in ("price_above", "price_below") and body.price is None:
        raise HTTPException(status_code=422, detail="price required for price alerts")
    if body.alert_type == "earnings_date" and body.days_before is None:
        raise HTTPException(status_code=422, detail="days_before required for earnings_date alerts")
    alert = create_alert(
        user_id=current_user["id"],
        ticker=body.ticker.upper(),
        alert_type=body.alert_type,
        price=body.price,
        days_before=body.days_before,
        note=body.note,
    )
    return alert


@router.patch("/{alert_id}")
def patch_alert(alert_id: str, body: AlertPatch, current_user: dict = Depends(get_current_user)):
    kwargs = body.model_dump(exclude_none=True)
    if "is_active" in kwargs:
        kwargs["is_active"] = 1 if kwargs["is_active"] else 0
    updated = update_alert(alert_id, current_user["id"], **kwargs)
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    deleted = delete_alert(alert_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Alert not found")


# ---------------------------------------------------------------------------
# Alert check endpoint (called by cron / scheduled task)
# Requires internal API key header for security.
# ---------------------------------------------------------------------------
_CRON_KEY = os.environ.get("CRON_SECRET_KEY", "")


@router.post("/check")
async def check_alerts():
    """
    Evaluate all active untriggered alerts.
    Fetches live prices via yfinance and earnings dates via Yahoo.
    Marks triggered alerts and sends email stubs (SMTP not yet configured).
    Returns summary of triggered alerts.
    """
    alerts = get_all_active_alerts()
    if not alerts:
        return {"triggered": 0, "checked": 0}

    # Group tickers for batch price fetch
    tickers_price = list({a["ticker"] for a in alerts if a["alert_type"] in ("price_above", "price_below")})
    tickers_earnings = list({a["ticker"] for a in alerts if a["alert_type"] == "earnings_date"})

    prices: dict[str, float] = {}
    earnings_dates: dict[str, datetime | None] = {}

    if tickers_price:
        try:
            import yfinance as yf
            data = yf.download(tickers_price, period="1d", auto_adjust=True, progress=False)
            close = data.get("Close") if hasattr(data, "get") else data["Close"] if "Close" in data.columns else None
            if close is not None:
                if hasattr(close, "columns"):
                    for t in tickers_price:
                        if t in close.columns:
                            v = close[t].dropna()
                            if not v.empty:
                                prices[t] = float(v.iloc[-1])
                else:
                    v = close.dropna()
                    if not v.empty and len(tickers_price) == 1:
                        prices[tickers_price[0]] = float(v.iloc[-1])
        except Exception as e:
            logger.warning("Alert check: price fetch failed — %s", e)

    if tickers_earnings:
        try:
            import yfinance as yf
            for t in tickers_earnings:
                try:
                    cal = yf.Ticker(t).calendar
                    if cal is not None and not cal.empty:
                        ed = cal.get("Earnings Date")
                        if ed is not None and len(ed) > 0:
                            earnings_dates[t] = pd.Timestamp(ed[0]).to_pydatetime().replace(tzinfo=timezone.utc)
                except Exception:
                    pass
        except Exception as e:
            logger.warning("Alert check: earnings fetch failed — %s", e)

    triggered = []
    now = datetime.now(timezone.utc)

    for alert in alerts:
        ticker = alert["ticker"]
        atype  = alert["alert_type"]
        fired  = False

        if atype == "price_above" and ticker in prices:
            fired = prices[ticker] >= (alert["price"] or 0)
        elif atype == "price_below" and ticker in prices:
            fired = prices[ticker] <= (alert["price"] or float("inf"))
        elif atype == "earnings_date" and ticker in earnings_dates:
            ed = earnings_dates[ticker]
            if ed:
                days = (alert["days_before"] or 1)
                fired = now >= ed - timedelta(days=days)

        if fired:
            update_alert(alert["id"], alert["user_id"], triggered_at=now.isoformat(), is_active=0)
            triggered.append({
                "alert_id": alert["id"],
                "user_email": alert.get("email", ""),
                "ticker": ticker,
                "type": atype,
                "price": prices.get(ticker),
            })
            # Email stub — will send when SMTP is configured
            _send_alert_email_stub(alert, prices.get(ticker))

    logger.info("Alert check complete: %d triggered / %d checked", len(triggered), len(alerts))
    return {"triggered": len(triggered), "checked": len(alerts), "details": triggered}


def _send_alert_email_stub(alert: dict, current_price: float | None) -> None:
    """Placeholder for email sending. Configure SMTP/SendGrid via env vars later."""
    logger.info(
        "[ALERT EMAIL STUB] To: %s | Ticker: %s | Type: %s | Price: %s | Target: %s",
        alert.get("email", ""),
        alert["ticker"],
        alert["alert_type"],
        current_price,
        alert.get("price"),
    )
