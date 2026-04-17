"""
Billing router — Stripe integration.
Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env to activate.

GET  /billing/plans             — list plans
GET  /billing/subscription      — current user subscription
POST /billing/checkout-session  — create Stripe Checkout session
POST /billing/portal-session    — create Stripe Customer Portal session
POST /billing/webhook           — Stripe webhook handler
GET  /billing/invoices          — invoices for current user
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from ..auth.jwt_handler import get_current_user
from ..db import (
    downgrade_to_free,
    get_subscription,
    get_user_by_id,
    get_user_by_stripe_customer,
    set_stripe_customer,
    upsert_subscription,
)

logger = logging.getLogger(__name__)
router = APIRouter()

STRIPE_SECRET_KEY: str | None = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET: str | None = os.environ.get("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")

STRIPE_PRICE_PRO = os.environ.get("STRIPE_PRICE_PRO", "price_REPLACE_PRO")
STRIPE_PRICE_INSTITUTIONAL = os.environ.get("STRIPE_PRICE_INSTITUTIONAL", "price_REPLACE_INST")

# price_id → plan name mapping (used in webhook)
_PRICE_TO_PLAN: dict[str, str] = {
    STRIPE_PRICE_PRO: "pro",
    STRIPE_PRICE_INSTITUTIONAL: "institutional",
}

PLANS = [
    {
        "id": "free",
        "name": "FREE",
        "price_eur": 0,
        "billing_interval": None,
        "stripe_price_id": None,
        "features": [
            "Macro dashboard (read-only)",
            "3 screener runs / day",
            "Portfolio optimizer (HRP only)",
        ],
    },
    {
        "id": "pro",
        "name": "PRO",
        "price_eur": 29,
        "billing_interval": "month",
        "stripe_price_id": STRIPE_PRICE_PRO,
        "features": [
            "Unlimited screener + scorer",
            "All 5 optimization methods",
            "Monte Carlo & VaR/CVaR",
            "ML Alpha signals",
            "PDF export",
            "API access (1 000 req/day)",
        ],
    },
    {
        "id": "institutional",
        "name": "INSTITUTIONAL",
        "price_eur": 149,
        "billing_interval": "month",
        "stripe_price_id": STRIPE_PRICE_INSTITUTIONAL,
        "features": [
            "Unlimited API access",
            "Custom screener universe",
            "White-label reports",
            "Team seats (up to 10)",
            "Priority support (SLA 4h)",
        ],
    },
]


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str | None = None
    cancel_url: str | None = None


def _require_stripe():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Stripe integration not configured. Set STRIPE_SECRET_KEY.",
        )
    try:
        import stripe  # type: ignore
        stripe.api_key = STRIPE_SECRET_KEY
        return stripe
    except ImportError:
        raise HTTPException(status_code=503, detail="stripe package not installed.")


# ---------------------------------------------------------------------------
# GET /billing/plans
# ---------------------------------------------------------------------------
@router.get("/plans")
def list_plans() -> Any:
    return {"plans": PLANS}


# ---------------------------------------------------------------------------
# GET /billing/subscription
# ---------------------------------------------------------------------------
@router.get("/subscription")
def get_subscription_route(current_user: dict = Depends(get_current_user)) -> Any:
    sub = get_subscription(current_user["sub"])
    if not sub:
        return {"plan": "free", "status": "active", "current_period_end": None, "cancel_at_period_end": False}
    return {
        "plan": sub["plan"],
        "status": sub["status"],
        "current_period_end": sub["current_period_end"],
        "cancel_at_period_end": bool(sub["cancel_at_period_end"]),
    }


# ---------------------------------------------------------------------------
# POST /billing/checkout-session
# ---------------------------------------------------------------------------
@router.post("/checkout-session")
def create_checkout_session(
    req: CheckoutRequest,
    current_user: dict = Depends(get_current_user),
) -> Any:
    stripe = _require_stripe()

    plan = next((p for p in PLANS if p["id"] == req.plan_id), None)
    if plan is None:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {req.plan_id!r}")
    if plan["stripe_price_id"] is None:
        raise HTTPException(status_code=422, detail="Free plan requires no checkout.")

    user = get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    try:
        # Create Stripe customer on first checkout if not yet stored
        customer_id: str | None = user["stripe_customer_id"]
        if not customer_id:
            customer = stripe.Customer.create(email=user["email"])
            customer_id = customer.id
            set_stripe_customer(user["id"], customer_id)

        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{"price": plan["stripe_price_id"], "quantity": 1}],
            mode="subscription",
            success_url=req.success_url or f"{FRONTEND_URL}/account?checkout=success",
            cancel_url=req.cancel_url or f"{FRONTEND_URL}/account",
        )
        return {"url": session.url, "session_id": session.id}
    except Exception as exc:
        logger.error("Stripe checkout session error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create checkout session.")


# ---------------------------------------------------------------------------
# POST /billing/portal-session
# ---------------------------------------------------------------------------
@router.post("/portal-session")
def create_portal_session(current_user: dict = Depends(get_current_user)) -> Any:
    stripe = _require_stripe()

    user = get_user_by_id(current_user["sub"])
    if not user or not user["stripe_customer_id"]:
        raise HTTPException(status_code=400, detail="No active subscription found.")

    try:
        session = stripe.billing_portal.Session.create(
            customer=user["stripe_customer_id"],
            return_url=f"{FRONTEND_URL}/account",
        )
        return {"url": session.url}
    except Exception as exc:
        logger.error("Stripe portal session error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create billing portal session.")


# ---------------------------------------------------------------------------
# POST /billing/webhook
# ---------------------------------------------------------------------------
@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
) -> Any:
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret not configured.")

    payload = await request.body()

    try:
        import stripe  # type: ignore
        event = stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
    except ImportError:
        raise HTTPException(status_code=503, detail="stripe package not installed.")
    except Exception as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    event_type: str = event["type"]
    logger.info("Stripe webhook: %s", event_type)

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        customer_id = session.get("customer")
        if customer_id:
            user = get_user_by_stripe_customer(customer_id)
            if user:
                # Subscription object not always expanded here; handled by subscription.updated
                logger.info("Checkout completed for user %s", user["id"])

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        if customer_id:
            user = get_user_by_stripe_customer(customer_id)
            if user:
                price_id = sub["items"]["data"][0]["price"]["id"]
                plan = _PRICE_TO_PLAN.get(price_id, "pro")
                period_end = datetime.fromtimestamp(
                    sub["current_period_end"], tz=timezone.utc
                ).isoformat()
                upsert_subscription(
                    user_id=user["id"],
                    plan=plan,
                    status=sub["status"],
                    stripe_subscription_id=sub["id"],
                    current_period_end=period_end,
                    cancel_at_period_end=sub.get("cancel_at_period_end", False),
                )
                logger.info("Subscription updated user=%s plan=%s status=%s", user["id"], plan, sub["status"])

    elif event_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        if customer_id:
            user = get_user_by_stripe_customer(customer_id)
            if user:
                downgrade_to_free(user["id"])
                logger.info("Subscription cancelled — user %s downgraded to free", user["id"])

    elif event_type == "invoice.payment_failed":
        invoice = event["data"]["object"]
        logger.warning("Payment failed — customer: %s", invoice.get("customer"))

    return {"received": True, "type": event_type}


# ---------------------------------------------------------------------------
# GET /billing/invoices
# ---------------------------------------------------------------------------
@router.get("/invoices")
def list_invoices(current_user: dict = Depends(get_current_user)) -> Any:
    if not STRIPE_SECRET_KEY:
        return {
            "invoices": [
                {"id": "INV-0008", "date": "2026-04-01", "amount_eur": 29.0, "status": "paid"},
                {"id": "INV-0007", "date": "2026-03-01", "amount_eur": 29.0, "status": "paid"},
            ]
        }

    stripe = _require_stripe()

    user = get_user_by_id(current_user["sub"])
    if not user or not user["stripe_customer_id"]:
        return {"invoices": []}

    try:
        invoices = stripe.Invoice.list(customer=user["stripe_customer_id"], limit=20)
        return {
            "invoices": [
                {
                    "id": inv["id"],
                    "date": datetime.fromtimestamp(inv["created"], tz=timezone.utc).date().isoformat(),
                    "amount_eur": inv["amount_paid"] / 100,
                    "status": inv["status"],
                    "pdf_url": inv.get("invoice_pdf"),
                }
                for inv in invoices.auto_paging_iter()
            ]
        }
    except Exception as exc:
        logger.error("Stripe invoice list error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve invoices.")
