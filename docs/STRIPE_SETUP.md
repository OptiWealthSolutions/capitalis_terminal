# Stripe Setup — CAPITALIS V2

End-to-end setup for subscription billing (Stripe Checkout + Customer Portal + Webhooks).

---

## 1. Stripe Dashboard Setup

### 1.1. Create the Stripe account
1. Sign up at https://dashboard.stripe.com/register.
2. Toggle **Test mode** (top-right) for development. Switch to **Live mode** only after end-to-end test passes.

### 1.2. Create products + prices
You need 4 prices: PRO monthly, PRO annual, PREMIUM monthly, PREMIUM annual.

For each tier:
1. Dashboard → **Catalog → Products → + Add product**.
2. Name: `Capitalis Pro` (or `Capitalis Premium`).
3. Pricing: Recurring → Monthly → 6.99 EUR (Pro) / 19.99 EUR (Premium).
4. Save. Copy the `price_xxx` ID.
5. On the product page → **+ Add another price** → Recurring → Yearly → 75.49 EUR (Pro) / 215.89 EUR (Premium).
6. Copy the annual `price_xxx` ID.

### 1.3. Get API keys
1. Dashboard → **Developers → API keys**.
2. Copy **Secret key** (`sk_test_...` or `sk_live_...`).
3. Public key (`pk_test_...`) is not used by the backend; safe to ignore.

### 1.4. Setup webhook endpoint
1. Dashboard → **Developers → Webhooks → + Add endpoint**.
2. Endpoint URL:
   - Local dev: tunnel via Stripe CLI (next section).
   - Prod: `https://api.your-domain.com/api/billing/webhook`.
3. Listen to events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`   # fired ~3 days before trial ends
   - `invoice.payment_failed`
4. Save → reveal **Signing secret** (`whsec_...`). Copy it.

### 1.5. Enable Customer Portal
1. Dashboard → **Settings → Billing → Customer portal**.
2. Enable cancellation, plan switching, invoice history.
3. Set return URL: `https://your-domain.com/account` (or `http://localhost:3000/account` in dev).

---

## 2. Backend `.env` configuration

Add to project root `.env`:

```bash
# Stripe API
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...        # CRITICAL — webhook fails silently without this

# Frontend URL (used for Checkout success/cancel redirects)
FRONTEND_URL=http://localhost:3000     # dev
# FRONTEND_URL=https://app.capitalis.io  # prod

# Price IDs (use either *_MONTHLY/*_PREMIUM or short PRO/INSTITUTIONAL names — both supported)
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_INSTITUTIONAL=price_...
STRIPE_PRICE_INSTITUTIONAL_ANNUAL=price_...

# OPTIONAL — pre-built Payment Links (used as fallback if Checkout Session creation fails)
STRIPE_PAYMENT_LINK_PRO=https://buy.stripe.com/test_...
STRIPE_PAYMENT_LINK_PRO_ANNUAL=https://buy.stripe.com/test_...
STRIPE_PAYMENT_LINK_INSTITUTIONAL=https://buy.stripe.com/test_...
STRIPE_PAYMENT_LINK_INSTITUTIONAL_ANNUAL=https://buy.stripe.com/test_...

# OPTIONAL — trial + annual discount
STRIPE_TRIAL_DAYS=7                    # Free trial length (default 7); set 0 to disable
STRIPE_ANNUAL_COUPON_ID=               # Coupon id (e.g. "ANNUAL_2MONTHS_FREE", 16.67% off) applied
                                       # to annual checkouts. Create in Dashboard → Coupons.
```

### 1.6. Free trial without CC (Free Trial No-CC)

Backend automatically attaches `trial_period_days` + `payment_method_collection: "if_required"` on first-time customers (those with no past Stripe Subscription). Trial auto-cancels at end if no payment method is provided (`trial_settings.end_behavior.missing_payment_method = "cancel"`).

Returning customers (any past sub on the same Stripe Customer) skip the trial.

### 1.7. Annual = 2 months free coupon

Two ways:

1. **Cleanest**: in Dashboard, set annual price = monthly × 10 (e.g. €69.90/yr for Pro). Frontend already displays "2 mois offerts" badge.
2. **Coupon-based**: create a Coupon (Dashboard → Coupons → +Add) with 16.67% off, copy the id, set `STRIPE_ANNUAL_COUPON_ID=<id>`. Backend attaches it on annual checkouts only.

Restart backend after editing.

---

## 3. Local development — webhook forwarding

Webhooks need a public URL. Use the Stripe CLI:

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:8000/api/billing/webhook
```

The CLI prints a `whsec_...` secret — paste it as `STRIPE_WEBHOOK_SECRET` in `.env` and restart backend.

Trigger test events:
```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

---

## 4. End-to-end test

1. Log in to the app as a free user.
2. Open `/account` → click **Upgrade to Pro**.
3. Backend hits `POST /api/billing/checkout-session` → returns Stripe Checkout URL.
4. On Stripe Checkout, use test card: `4242 4242 4242 4242` / any future expiry / any CVC / any zip.
5. After payment, Stripe redirects to `${FRONTEND_URL}/account?checkout=success`.
6. Stripe fires `customer.subscription.created` → backend webhook upserts subscription → user plan = `pro`.
7. Verify in DB: `SELECT plan FROM subscriptions WHERE user_id = '<id>'`.

---

## 5. Production deployment checklist

- [ ] Live API keys (`sk_live_...`) set in prod `.env`
- [ ] Live webhook endpoint added in Stripe dashboard pointing to prod URL
- [ ] Live webhook signing secret set as `STRIPE_WEBHOOK_SECRET`
- [ ] Live price IDs created and set in env vars
- [ ] `FRONTEND_URL` points to prod frontend
- [ ] Customer Portal return URL set to prod `/account`
- [ ] Tax settings configured (Stripe Tax for VAT — EU customers)
- [ ] Webhook delivery monitored (Stripe Dashboard → Webhooks → endpoint → see attempt log)

---

## 6. Backend implementation reference

| Endpoint | Purpose |
|---|---|
| `GET /api/billing/plans` | Public plan catalog (used by `/account` pricing page) |
| `GET /api/billing/limits` | Current user plan + enforced feature limits |
| `GET /api/billing/subscription` | Current user subscription state |
| `POST /api/billing/checkout-session` | Create a Stripe Checkout Session, returns redirect URL |
| `POST /api/billing/portal-session` | Open Stripe Customer Portal for plan/cancellation management |
| `POST /api/billing/webhook` | Stripe webhook receiver — upserts subscription state |
| `GET /api/billing/invoices` | List user invoices from Stripe |

Webhook handler: [`backend/routers/billing.py:stripe_webhook`](../backend/routers/billing.py).

Plan enforcement: [`backend/plan_gate.py`](../backend/plan_gate.py) — `PLAN_LIMITS` dict is single source of truth for per-tier features.

---

## 7. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| Webhook returns 503 "Webhook secret not configured" | `STRIPE_WEBHOOK_SECRET` empty | Set env var, restart backend |
| Webhook returns 400 "Invalid signature" | Wrong signing secret OR proxy strips raw body | Use the CLI's `whsec_...`, ensure backend reads raw body (already correct) |
| User pays but plan stays `free` | Webhook not firing OR signature invalid | Check Stripe Dashboard → Webhooks → recent deliveries for error |
| Checkout 422 "Unknown plan" | Frontend sends wrong `plan_id` | Must be `"pro"` or `"premium"` (lowercase) |
| Checkout 503 "Stripe not configured" | `STRIPE_SECRET_KEY` empty | Set env var, restart backend |
| Stripe CLI shows `current_period_end` missing | New Stripe API moved field to `items.data[0]` | Backend already handles fallback |
