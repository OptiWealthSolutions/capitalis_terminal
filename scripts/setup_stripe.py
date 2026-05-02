"""
Idempotent Stripe setup for CAPITALIS V2.

Creates / reuses:
    Products  : "Capitalis Pro", "Capitalis Premium"
    Prices    : pro_monthly (€6.99), pro_annual (€69.90),
                premium_monthly (€19.99), premium_annual (€199.90)
                Annual = monthly × 10 (2 months free baked in).
    Coupon    : ANNUAL_2MONTHS_FREE (16.67% off, used by backend)
    Webhook   : optional, --webhook-url <https://api.example.com/api/billing/webhook>

Uses lookup_key on each Price so re-runs reuse, never duplicate.

Usage:
    .venv/bin/python scripts/setup_stripe.py
    .venv/bin/python scripts/setup_stripe.py --webhook-url https://api.example.com/api/billing/webhook

Env required:
    STRIPE_SECRET_KEY (sk_test_... or sk_live_...)
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Optional

# Load .env early
ROOT = Path(__file__).resolve().parent.parent
_env = ROOT / ".env"
if _env.exists():
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(_env, override=False)
    except ImportError:
        for line in _env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"\''))


PRODUCTS = {
    "pro": {
        "name": "Capitalis Pro",
        "description": "Unlock all optimizers, market map, screener and PDF reports.",
        "monthly_eur": 6.99,
        "annual_eur":  69.90,   # = 6.99 × 10
    },
    "premium": {
        "name": "Capitalis Premium",
        "description": "All Pro features + ML alpha signals, predictions, custom alerts.",
        "monthly_eur": 19.99,
        "annual_eur":  199.90,  # = 19.99 × 10
    },
}

COUPON_ID = "ANNUAL_2MONTHS_FREE"
COUPON_PERCENT_OFF = 16.67  # 2 months out of 12

WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.payment_failed",
]


def _eur_to_cents(amount: float) -> int:
    return int(round(amount * 100))


def _ensure_product(stripe, slug: str, name: str, description: str) -> str:
    """Find product by metadata.capitalis_slug, else create."""
    products = stripe.Product.list(limit=100, active=True)
    for p in products.data:
        if getattr(p.metadata, "capitalis_slug", None) == slug:
            print(f"  ✓ product reused: {name} ({p.id})")
            return p.id
    p = stripe.Product.create(
        name=name,
        description=description,
        metadata={"capitalis_slug": slug},
    )
    print(f"  + product created: {name} ({p.id})")
    return p.id


def _ensure_price(stripe, product_id: str, lookup_key: str,
                  amount_cents: int, interval: str) -> str:
    """Find price by lookup_key, else create."""
    existing = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1)
    if existing.data:
        p = existing.data[0]
        rec_interval = getattr(p.recurring, "interval", None) if p.recurring else None
        if (p.unit_amount != amount_cents
                or rec_interval != interval
                or p.product != product_id):
            print(f"  ↻ price drift on {lookup_key}; archiving {p.id}")
            stripe.Price.modify(p.id, active=False)
        else:
            print(f"  ✓ price reused: {lookup_key} ({p.id})")
            return p.id
    p = stripe.Price.create(
        product=product_id,
        unit_amount=amount_cents,
        currency="eur",
        recurring={"interval": interval},
        lookup_key=lookup_key,
        transfer_lookup_key=True,
    )
    print(f"  + price created: {lookup_key} = €{amount_cents/100:.2f}/{interval} ({p.id})")
    return p.id


def _ensure_coupon(stripe) -> str:
    try:
        c = stripe.Coupon.retrieve(COUPON_ID)
        print(f"  ✓ coupon reused: {COUPON_ID} ({c.percent_off}% off)")
        return c.id
    except Exception:
        pass
    c = stripe.Coupon.create(
        id=COUPON_ID,
        percent_off=COUPON_PERCENT_OFF,
        duration="once",  # applied to first invoice only (annual one-shot)
        name="2 mois offerts (annuel)",
    )
    print(f"  + coupon created: {COUPON_ID} ({c.percent_off}% off)")
    return c.id


def _ensure_webhook(stripe, url: str) -> str:
    endpoints = stripe.WebhookEndpoint.list(limit=100)
    for e in endpoints.data:
        if e.url == url:
            # Ensure event list contains all required
            missing = [ev for ev in WEBHOOK_EVENTS if ev not in e.enabled_events]
            if missing:
                merged = sorted(set(list(e.enabled_events) + WEBHOOK_EVENTS))
                stripe.WebhookEndpoint.modify(e.id, enabled_events=merged)
                print(f"  ↻ webhook events updated: {e.id} (added {missing})")
            else:
                print(f"  ✓ webhook reused: {e.id}")
            return e.id
    e = stripe.WebhookEndpoint.create(
        url=url,
        enabled_events=WEBHOOK_EVENTS,
        description="Capitalis V2 backend",
    )
    print(f"  + webhook created: {e.id}")
    print(f"    SIGNING SECRET (set as STRIPE_WEBHOOK_SECRET): {e.secret}")
    return e.id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--webhook-url",
        help="Public backend webhook URL (e.g. https://api.example.com/api/billing/webhook). "
             "Skip to leave webhook unmanaged.",
        default=None,
    )
    args = parser.parse_args()

    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        print("ERROR: STRIPE_SECRET_KEY missing from environment / .env", file=sys.stderr)
        return 2

    try:
        import stripe  # type: ignore
    except ImportError:
        print("ERROR: stripe package not installed. pip install stripe", file=sys.stderr)
        return 2

    stripe.api_key = key
    mode = "TEST" if key.startswith("sk_test_") else "LIVE"
    print(f"\nStripe mode: {mode}\n")

    # 1. Products + prices
    env_lines: list[str] = []
    for slug, cfg in PRODUCTS.items():
        print(f"[{slug.upper()}]")
        product_id = _ensure_product(stripe, slug, cfg["name"], cfg["description"])
        monthly_id = _ensure_price(
            stripe, product_id,
            lookup_key=f"capitalis_{slug}_monthly",
            amount_cents=_eur_to_cents(cfg["monthly_eur"]),
            interval="month",
        )
        annual_id = _ensure_price(
            stripe, product_id,
            lookup_key=f"capitalis_{slug}_annual",
            amount_cents=_eur_to_cents(cfg["annual_eur"]),
            interval="year",
        )
        env_lines.append(f"STRIPE_PRICE_{slug.upper()}={monthly_id}")
        env_lines.append(f"STRIPE_PRICE_{slug.upper()}_ANNUAL={annual_id}")
        # Backwards-compat aliases used by billing.py
        if slug == "premium":
            env_lines.append(f"STRIPE_PRICE_INSTITUTIONAL={monthly_id}")
            env_lines.append(f"STRIPE_PRICE_INSTITUTIONAL_ANNUAL={annual_id}")
        print()

    # 2. Coupon
    print("[COUPON]")
    coupon_id = _ensure_coupon(stripe)
    env_lines.append(f"STRIPE_ANNUAL_COUPON_ID={coupon_id}")
    print()

    # 3. Webhook (optional)
    if args.webhook_url:
        print("[WEBHOOK]")
        _ensure_webhook(stripe, args.webhook_url)
        print()

    # 4. Print env block
    print("\n" + "=" * 60)
    print("Add / replace in .env (restart backend after):")
    print("=" * 60)
    for line in env_lines:
        print(line)
    print("STRIPE_TRIAL_DAYS=7")
    if not args.webhook_url:
        print()
        print("# Webhook not managed (no --webhook-url given).")
        print("# Locally: stripe listen --forward-to localhost:8000/api/billing/webhook")
        print("# Prod   : re-run with --webhook-url https://api.your-domain.com/api/billing/webhook")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
