# ThreeStarOps Cloudflare Full App Backend v65

This build makes the Cloudflare deployment functional without Render for the core account/app workflow.

## Runtime layout

- Cloudflare Pages serves `static/`.
- Cloudflare Pages Functions handles `/api/*` from `functions/api/[[path]].js`.
- Cloudflare D1 stores accounts, password hashes, sessions, subscriptions, inventory, vendors, products, recipes, POS CSV sales rows, projection profiles, prep tasks, orders, deliveries, schedules, saved inventory snapshots, QR records, team notes, and settings.
- Cloudflare R2 stores uploaded pictures/files through the `FILES_BUCKET` binding.
- Stripe Buy Buttons start checkout.
- Stripe webhooks activate the correct tier in D1.

## Full-file rewrite

Path and filename:

```text
chef-ledger-operational/functions/api/[[path]].js
```

This file now implements persistent D1-backed routes for the main app instead of placeholder empty responses.

## Required Cloudflare Pages settings

```text
Framework preset: None
Build command: leave blank
Build output directory: static
Root directory: leave blank
```

## Required bindings

In Cloudflare Pages → ThreeStarOps → Settings → Bindings:

```text
D1 database binding
Variable name: DB
Database: threestarops-db
```

```text
R2 bucket binding
Variable name: FILES_BUCKET
Bucket: threestarops-files
```

## Required D1 migrations

Run both migrations if this is a new database:

```powershell
npx wrangler d1 execute threestarops-db --remote --file migrations/0001_cloudflare_d1_auth.sql
npx wrangler d1 execute threestarops-db --remote --file migrations/0002_cloudflare_full_app_records.sql
```

If you already ran v64 migration, run only:

```powershell
npx wrangler d1 execute threestarops-db --remote --file migrations/0002_cloudflare_full_app_records.sql
```

The v65 function also creates missing tables automatically at runtime, but running migrations is still recommended.

## Stripe webhook

Stripe endpoint:

```text
https://threestarops.com/api/stripe/webhook
```

Events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

Add the webhook signing secret to Cloudflare Pages environment variables:

```text
STRIPE_WEBHOOK_SECRET = whsec_...
```

Then redeploy.

## Smoke test URLs

```text
https://threestarops.com/api/health
https://threestarops.com
```

Expected health response includes:

```json
{"ok":true,"runtime":"cloudflare-pages-functions","version":"v65-full-cloudflare"}
```

## What persists now

The following are saved in Cloudflare D1 and come back after sign-out/sign-in:

- new user accounts
- password hashes and sessions
- subscription status and selected tier
- vendors
- products/inventory counts
- stations and locations
- recipes and plates
- POS CSV uploads and scanned plate sales rows
- projection/special profiles
- forecaster apply/undo events
- prep tasks and station counts
- saved inventory/count snapshots
- orders and delivery records
- menu workspace data
- QR code records
- team notes, access grants, availability, schedules, and time-off records

Uploaded pictures are saved to Cloudflare R2 when the `FILES_BUCKET` binding exists.
