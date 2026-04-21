# CAPITALIS V2 — Deployment Guide

## Recommended Stack (1-week launch)

```
┌─────────────────────────────────────┐
│  Vercel (Next.js frontend)          │  free → $20/mo Pro
│  https://capitalis.io               │
└──────────────┬──────────────────────┘
               │ API calls → /api/* → rewrites
┌──────────────▼──────────────────────┐
│  Railway (FastAPI + PostgreSQL)     │  ~$10-15/mo
│  https://api.capitalis.io           │
└─────────────────────────────────────┘
```

**Why this stack:**
- Vercel: zero-config Next.js, automatic git deploys, CDN, free SSL
- Railway: Docker-native, managed Postgres, one-click env vars, $5 base
- Stripe webhooks: direct to Railway backend URL

---

## Step 1 — Migrate SQLite → PostgreSQL

All SQLite DBs (`users.db`, `portfolios_v2.db`, `tracker_v2.db`, `user_prefs.db`) must be replaced with PostgreSQL for production.

Install `asyncpg` / `psycopg2`:
```bash
pip install psycopg2-binary
```

Railway provides `DATABASE_URL` env var automatically. Add to `.env`:
```env
DATABASE_URL=postgresql://user:pass@host:5432/capitalis
```

Key files to migrate:
- `backend/db.py` — users + subscriptions tables
- `backend/routers/portfolio.py` — portfolios + tracker tables
- `backend/routers/settings_router.py` — user_preferences table

---

## Step 2 — Environment Variables

### Backend (Railway)
```env
ENV=production
DATABASE_URL=postgresql://...          # auto-provided by Railway
JWT_SECRET_KEY=<64-byte hex>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
STRIPE_SECRET_KEY=sk_live_...          # switch to LIVE key for prod
STRIPE_WEBHOOK_SECRET=whsec_...        # from Stripe Dashboard → Webhooks
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_INSTITUTIONAL=price_...
STRIPE_PAYMENT_LINK_PRO=https://buy.stripe.com/...
STRIPE_PAYMENT_LINK_INSTITUTIONAL=https://buy.stripe.com/...
GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
FRONTEND_URL=https://capitalis.io
ALLOWED_ORIGINS=https://capitalis.io
FRED_API_KEY=...
ALPHA_VANTAGE_API_KEY=...
```

### Frontend (Vercel)
```env
NEXT_PUBLIC_API_URL=https://api.capitalis.io
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same-as-backend>
```

---

## Step 3 — Vercel Setup

1. Push repo to GitHub
2. Import project at vercel.com → select `frontend/` as root directory
3. Add env vars in Vercel Dashboard → Settings → Environment Variables
4. Add `vercel.json` to `frontend/`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://api.capitalis.io/api/:path*" }
  ]
}
```

5. Custom domain: Vercel Dashboard → Domains → add `capitalis.io`

---

## Step 4 — Railway Setup

1. Create project at railway.app
2. Add PostgreSQL plugin (auto-sets `DATABASE_URL`)
3. Connect GitHub repo → set root to `/` → start command:
   ```
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
4. Add all backend env vars in Railway Dashboard
5. Custom domain: Railway → Settings → Networking → add `api.capitalis.io`
6. Point DNS: `api.capitalis.io CNAME <railway-domain>.up.railway.app`

---

## Step 5 — Stripe Production

1. Go to Stripe Dashboard → toggle Live mode
2. Create Pro + Institutional products again in Live mode (same as sandbox)
3. Update `STRIPE_SECRET_KEY` to `sk_live_...`
4. Add Stripe webhook:
   - Endpoint: `https://api.capitalis.io/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy signing secret → `STRIPE_WEBHOOK_SECRET`
5. Update `STRIPE_PRICE_PRO`, `STRIPE_PRICE_INSTITUTIONAL`, payment links with live IDs

---

## Step 6 — Google OAuth Production

1. Google Cloud Console → OAuth 2.0 Credentials → edit existing client
2. Add authorized origins: `https://capitalis.io`
3. Add authorized redirect URIs: `https://capitalis.io`
4. Same `GOOGLE_CLIENT_ID` works for both dev and prod

---

## Step 7 — Pre-launch Checklist

- [ ] `ENV=production` in backend env
- [ ] `JWT_SECRET_KEY` is 64-byte random (not dev key)
- [ ] All SQLite DBs migrated to PostgreSQL
- [ ] Stripe live keys active, webhook configured
- [ ] Google OAuth origins updated for production domain
- [ ] `ALLOWED_ORIGINS` set to production frontend URL only
- [ ] HTTPS enforced (Vercel/Railway handle this)
- [ ] Seed admin account on production DB
- [ ] Test all 3 plan tiers end-to-end
- [ ] Test Stripe payment flow end-to-end (use a real card in test mode first)

---

## Alternative: Self-hosted VPS

If you prefer more control (Hetzner CX21 ~€4/mo, OVH, etc.):

```
nginx (reverse proxy + SSL via Certbot)
  ├── / → Next.js (port 3000, PM2)
  └── /api → FastAPI (port 8000, uvicorn + systemd)

PostgreSQL (local or managed)
```

Docker Compose setup available on request.

---

## Cost Estimate (Monthly)

| Service | Cost |
|---|---|
| Vercel (Hobby) | Free |
| Railway (Starter) | ~$10-15 |
| PostgreSQL (Railway addon) | Included |
| Stripe | 2.9% + €0.25 per transaction |
| **Total** | **~€15/mo** |

Break-even: 3 Pro subscribers (3 × €7 = €21/mo).
