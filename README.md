# ThreeStarOps Render + Stripe App Package v63

Path: `chef-ledger-operational/README.md`

This package updates the Chef Ledger / ThreeStarOps app so the hosted site can run as a real Python backend on Render and use live Stripe Buy Buttons for email signup + tier purchase.

## What changed in v63

- `server.py` now detects Render's `$PORT` automatically and binds to `0.0.0.0` on hosted deployments.
- Added `requirements.txt` so Render's `pip install -r requirements.txt` build command succeeds.
- Added `render.yaml` and `Procfile` for hosted deployment.
- Added `/api/stripe/webhook` to activate accounts after Stripe checkout.
- Added Stripe signature verification using `STRIPE_WEBHOOK_SECRET` when configured.
- Added Stripe Buy Button IDs to `/api/subscription/tiers`.
- The lock screen now renders live Stripe Buy Buttons after profile creation.
- Each Stripe button receives a `client-reference-id` containing the ThreeStarOps team, user, and tier.
- Local preview activation is disabled automatically on Render/production unless explicitly enabled.

## Render build settings

Recommended settings:

```text
Runtime: Python
Build Command: python -m pip install --upgrade pip && pip install -r requirements.txt
Start Command: python server.py
Root Directory: leave blank
```

Environment variables:

```text
PYTHON_VERSION=3.11.9
CHEF_LEDGER_ALLOW_LOCAL_SUBSCRIPTION_ACTIVATE=false
STRIPE_WEBHOOK_SECRET=whsec_...
```

The Stripe publishable key and Buy Button IDs are already baked in as safe frontend defaults, but they can be overridden with environment variables.

## Stripe Buy Button mapping

```text
Starter / $10    = buy_btn_1ThUNgGJtywdCBcETVYJjTha
Kitchen / $14    = buy_btn_1ThUPGGJtywdCBcET4iAdZqh
Chef / $19       = buy_btn_1ThUPTGJtywdCBcEBqr6zQiM
Authority / $25  = buy_btn_1ThUOcGJtywdCBcEpfMequal
```

Publishable key:

```text
pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC
```

Do not commit any Stripe key beginning with `sk_live_`.

## Stripe webhook endpoint

While testing on Render:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/stripe/webhook
```

After the domain points to Render:

```text
https://threestarops.com/api/stripe/webhook
```

Listen for:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

## Signup/payment flow

```text
1. User creates restaurant profile.
2. Account is saved as pending_checkout.
3. User sees the subscription lock screen.
4. User clicks the Stripe Buy Button for Starter/Kitchen/Chef/Authority.
5. Stripe sends checkout.session.completed to /api/stripe/webhook.
6. ThreeStarOps updates the team subscription to active + selected tier.
7. User refreshes/signs in and the correct tools unlock.
```

## Local install pattern

```powershell
cd "C:\Users\ursamajor\Downloads"

Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

Unblock-File ".\chef-ledger-operational-render-stripe-v63.zip"

Remove-Item ".\chef-ledger-operational" -Recurse -Force -ErrorAction SilentlyContinue

Expand-Archive -Path ".\chef-ledger-operational-render-stripe-v63.zip" -DestinationPath "." -Force

cd ".\chef-ledger-operational"

powershell -ExecutionPolicy Bypass -File ".\run.ps1"
```

## Push update to GitHub

```powershell
cd "C:\Users\ursamajor\Downloads\chef-ledger-operational"

git add .
git commit -m "Add Render Stripe subscription activation"
git push origin main
```

Then redeploy on Render.

## Cloudflare D1/R2 deployment

This v64 package includes a Cloudflare-native account/subscription backend in:

```text
functions/api/[[path]].js
migrations/0001_cloudflare_d1_auth.sql
wrangler.toml
README_CLOUDFLARE_D1_R2_THREESTAROPS.md
```

Use Cloudflare Pages with build output directory `static`, D1 binding `DB`, optional R2 binding `FILES_BUCKET`, and Stripe webhook endpoint `/api/stripe/webhook`.
