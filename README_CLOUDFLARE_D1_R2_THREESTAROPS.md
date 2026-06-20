# ThreeStarOps Cloudflare D1/R2 Setup

This build adds a Cloudflare-native account/subscription backend for the ThreeStarOps landing app.

It is designed for this deployment shape:

```text
Cloudflare Pages = static site
Cloudflare Pages Functions = /api backend
Cloudflare D1 = saved users, password hashes, sessions, subscriptions, Stripe event audit
Cloudflare R2 = uploaded pictures/CSVs/files
Stripe Buy Buttons = checkout
Stripe webhook = tier activation
```

## Included files

```text
functions/api/[[path]].js
migrations/0001_cloudflare_d1_auth.sql
wrangler.toml
package.json
scripts/cloudflare-d1-r2-setup.ps1
README_CLOUDFLARE_D1_R2_THREESTAROPS.md
```

## Stripe tier mapping

```text
Starter / $10    = buy_btn_1ThUNgGJtywdCBcETVYJjTha
Kitchen / $14    = buy_btn_1ThUPGGJtywdCBcET4iAdZqh
Chef / $19       = buy_btn_1ThUPTGJtywdCBcEBqr6zQiM
Authority / $25  = buy_btn_1ThUOcGJtywdCBcEpfMequal
```

Publishable key used by the frontend Buy Buttons:

```text
pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC
```

Never commit a `sk_live_...` key.

## Cloudflare Pages build settings

In Cloudflare:

```text
Workers & Pages -> threestarops -> Settings -> Builds & deployments
```

Use:

```text
Framework preset: None
Build command: leave blank
Build output directory: static
Root directory: leave blank
Environment variables: see below
```

## Required bindings

In:

```text
Workers & Pages -> threestarops -> Settings -> Bindings
```

Add:

```text
D1 database binding
Variable name: DB
Database: threestarops-db
```

Add optional R2 binding for uploads:

```text
R2 bucket binding
Variable name: FILES_BUCKET
Bucket: threestarops-files
```

The names `DB` and `FILES_BUCKET` must match exactly.

## Environment variables

In:

```text
Workers & Pages -> threestarops -> Settings -> Environment variables
```

Add this after creating the Stripe webhook:

```text
STRIPE_WEBHOOK_SECRET = whsec_...
```

If you do not add this, the webhook route still exists, but signature verification is skipped. Production should use the signing secret.

## Local terminal setup

From the repo root after copying this build into your GitHub repo:

```powershell
npm install
npx wrangler login
npx wrangler d1 create threestarops-db
```

Copy the returned `database_id` into `wrangler.toml`, or use the Cloudflare Dashboard binding instead.

Apply the D1 schema:

```powershell
npx wrangler d1 execute threestarops-db --remote --file migrations/0001_cloudflare_d1_auth.sql
```

Create the R2 bucket:

```powershell
npx wrangler r2 bucket create threestarops-files
```

Push to GitHub:

```powershell
git add .
git commit -m "Add Cloudflare D1 R2 account backend"
git push origin main
```

Then redeploy the Cloudflare Pages project.

## Stripe webhook endpoint

In Stripe:

```text
Developers -> Webhooks -> Add endpoint
```

Endpoint URL:

```text
https://threestarops.com/api/stripe/webhook
```

Events to send:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

After creating the webhook, copy the signing secret and set:

```text
STRIPE_WEBHOOK_SECRET = whsec_...
```

in Cloudflare Pages environment variables.

## What works in this Cloudflare starter backend

```text
/api/auth/register
/api/auth/login
/api/auth/logout
/api/session
/api/subscription/tiers
/api/subscription/select
/api/stripe/webhook
/api/files/pictures/folders
/api/files/pictures/upload
/api/files/pictures
/api/files/pictures/social_links
/api/files/pictures/generate_prompt
```

It also returns safe empty JSON responses for many app workspace endpoints so the app shell can open while the full restaurant operations backend is migrated feature-by-feature.

## Important production note

This Cloudflare build moves the account/subscription layer to D1. It does not fully port every Python/SQLite feature from `server.py` yet. The next migration phases should move:

```text
inventory
vendors
products
recipes
prep sheets
orders
POS CSV projection tables
scheduler/team workflows
```

from `server.py` SQLite tables into D1-backed Pages Functions.

## Quick test

After deploy:

```text
https://threestarops.com/api/health
```

Should return:

```json
{"ok": true, "runtime": "cloudflare-pages-functions", "d1": true}
```

Then test:

```text
1. Open https://threestarops.com
2. Create a new restaurant profile
3. Confirm it lands on the subscription lock screen
4. Choose a tier and complete Stripe checkout
5. Return to the site and use Refresh Status
6. Account unlocks after Stripe webhook activates the subscription
```
