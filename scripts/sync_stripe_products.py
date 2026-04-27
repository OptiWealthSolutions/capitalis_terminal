#!/usr/bin/env python3
"""
Sync Stripe products + prices to match the new Capitalis pricing.

Usage:
    STRIPE_SECRET_KEY=sk_test_... python scripts/sync_stripe_products.py
    STRIPE_SECRET_KEY=sk_live_... python scripts/sync_stripe_products.py --live

What it does (idempotent):
  1. Upserts product "Capitalis Pro"      → monthly €6.99,  annual €75.49
  2. Upserts product "Capitalis Premium"  → monthly €19.99, annual €215.89
  3. Archives any product whose name matches removed legacy SKUs
     (e.g. anything containing "ML Signals" / "ML Alpha").
  4. Prints the new price IDs so you can update env vars.

Safe to re-run: looks up existing products by name + metadata `slug`.
Old prices are *deactivated* (not deleted) so existing subscriptions keep working.
"""

from __future__ import annotations

import os
import sys
import argparse
from typing import Any

try:
    import stripe  # type: ignore
except ImportError:
    print("ERROR: stripe SDK not installed. Run: pip install stripe", file=sys.stderr)
    sys.exit(1)


# ── New plan catalog ─────────────────────────────────────────────────────────
PLANS = [
    {
        "slug":        "pro",
        "name":        "Capitalis Pro",
        "description": "Up to 5 portfolios, all optimizers, market map, "
                       "unlimited screener + scorer, Monte Carlo + VaR, "
                       "PDF reports with charts, community polls.",
        "monthly_eur": 699,    # €6.99
        "annual_eur":  7549,   # €75.49 (~10% off)
    },
    {
        "slug":        "premium",
        "name":        "Capitalis Premium",
        "description": "Unlimited portfolios, all 5 optimizers (incl. Max Sharpe), "
                       "predictions engine + backtesting, custom alerts, "
                       "priority support, early access to new features.",
        "monthly_eur": 1999,   # €19.99
        "annual_eur":  21589,  # €215.89 (~10% off)
    },
]

# Substring match — anything matching gets archived.
LEGACY_NAME_PATTERNS = [
    "ML Signals",
    "ML Alpha",
    "Capitalis Institutional",   # renamed → Premium
]


def _meta_get(obj: Any, key: str) -> Any:
    """Compat shim: StripeObject lost .get() in SDK v7+."""
    try:
        return obj[key]
    except (KeyError, TypeError):
        return None


def find_product_by_slug(slug: str) -> Any:
    """Find existing Capitalis product by metadata.slug."""
    for p in stripe.Product.list(limit=100, active=True).auto_paging_iter():
        if _meta_get(p.metadata, "slug") == slug:
            return p
    return None


def find_legacy_products() -> list:
    """Find products to archive based on name patterns."""
    out = []
    for p in stripe.Product.list(limit=100, active=True).auto_paging_iter():
        for pattern in LEGACY_NAME_PATTERNS:
            if pattern.lower() in (p.name or "").lower():
                out.append(p)
                break
    return out


def upsert_price(product_id: str, amount_cents: int, interval: str, lookup_key: str) -> str:
    """Create new price if no active price matches, else reuse. Deactivate stale prices."""
    # Look for existing active price with same lookup_key
    existing = stripe.Price.list(
        product=product_id,
        active=True,
        limit=100,
    ).data

    matched = None
    for pr in existing:
        if pr.lookup_key == lookup_key:
            if pr.unit_amount == amount_cents and pr.recurring and pr.recurring.interval == interval:
                matched = pr
            else:
                # Stale price with same lookup_key — deactivate so we can reuse the key
                try:
                    stripe.Price.modify(pr.id, lookup_key=None)
                    stripe.Price.modify(pr.id, active=False)
                    print(f"    deactivated stale price {pr.id}")
                except Exception as e:
                    print(f"    WARN could not deactivate {pr.id}: {e}")

    if matched:
        return matched.id

    new_price = stripe.Price.create(
        product=product_id,
        unit_amount=amount_cents,
        currency="eur",
        recurring={"interval": interval},
        lookup_key=lookup_key,
        nickname=f"{interval.capitalize()} {amount_cents/100:.2f} EUR",
    )
    return new_price.id


def upsert_product(plan: dict) -> dict:
    """Idempotent product+prices sync."""
    print(f"\n→ Plan: {plan['name']} ({plan['slug']})")

    existing = find_product_by_slug(plan["slug"])
    if existing:
        # Update name + description if drifted
        needs_update = (
            existing.name != plan["name"]
            or (existing.description or "") != plan["description"]
        )
        if needs_update:
            stripe.Product.modify(existing.id, name=plan["name"], description=plan["description"])
            print(f"    updated product metadata: {existing.id}")
        product_id = existing.id
    else:
        new_p = stripe.Product.create(
            name=plan["name"],
            description=plan["description"],
            metadata={"slug": plan["slug"], "managed_by": "capitalis"},
        )
        product_id = new_p.id
        print(f"    created product: {product_id}")

    monthly_id = upsert_price(product_id, plan["monthly_eur"], "month", f"capitalis_{plan['slug']}_monthly")
    annual_id  = upsert_price(product_id, plan["annual_eur"],  "year",  f"capitalis_{plan['slug']}_annual")

    return {
        "slug":       plan["slug"],
        "product_id": product_id,
        "monthly_id": monthly_id,
        "annual_id":  annual_id,
    }


def archive_legacy() -> None:
    legacy = find_legacy_products()
    if not legacy:
        print("\n→ No legacy products to archive.")
        return
    print(f"\n→ Archiving {len(legacy)} legacy product(s):")
    for p in legacy:
        try:
            stripe.Product.modify(p.id, active=False)
            print(f"    archived: {p.name} ({p.id})")
        except Exception as e:
            print(f"    WARN archive failed for {p.id}: {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Refuse if STRIPE_SECRET_KEY is not a live key.")
    args = parser.parse_args()

    api_key = os.environ.get("STRIPE_SECRET_KEY")
    if not api_key:
        print("ERROR: STRIPE_SECRET_KEY env var not set.", file=sys.stderr)
        sys.exit(1)

    is_live = api_key.startswith("sk_live_")
    if args.live and not is_live:
        print("ERROR: --live flag set but STRIPE_SECRET_KEY is not a live key.", file=sys.stderr)
        sys.exit(1)

    stripe.api_key = api_key
    mode = "LIVE" if is_live else "TEST"
    print(f"== Stripe sync — {mode} mode ==")

    results = [upsert_product(plan) for plan in PLANS]
    archive_legacy()

    print("\n" + "=" * 60)
    print("DONE — update your env vars with these IDs:")
    print("=" * 60)
    for r in results:
        print(f"\n# {r['slug'].upper()}")
        print(f"STRIPE_PRICE_{r['slug'].upper()}_MONTHLY={r['monthly_id']}")
        print(f"STRIPE_PRICE_{r['slug'].upper()}_ANNUAL={r['annual_id']}")
    print()


if __name__ == "__main__":
    main()
