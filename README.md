# ThreeStarOps / Chef Ledger

Restaurant inventory, prep, par, POS CSV forecasting, recipe, order, file, and accountability software.

This package is the Cloudflare-native v65 build.

## Production architecture

```text
Cloudflare Pages = site frontend
Cloudflare Pages Functions = /api backend
Cloudflare D1 = accounts, login, subscriptions, app data
Cloudflare R2 = pictures/files/CSVs
Stripe = checkout and subscription activation
```

## Cloudflare build settings

```text
Framework preset: None
Build command: leave blank
Build output directory: static
Root directory: leave blank
```

## Required bindings

```text
DB = D1 database binding for threestarops-db
FILES_BUCKET = R2 bucket binding for threestarops-files
```

## Migrations

For a new D1 database:

```powershell
npx wrangler d1 execute threestarops-db --remote --file migrations/0001_cloudflare_d1_auth.sql
npx wrangler d1 execute threestarops-db --remote --file migrations/0002_cloudflare_full_app_records.sql
```

For an existing v64 D1 database:

```powershell
npx wrangler d1 execute threestarops-db --remote --file migrations/0002_cloudflare_full_app_records.sql
```

## Stripe buttons

```text
Starter / $10    = buy_btn_1ThUNgGJtywdCBcETVYJjTha
Kitchen / $14    = buy_btn_1ThUPGGJtywdCBcET4iAdZqh
Chef / $19       = buy_btn_1ThUPTGJtywdCBcEBqr6zQiM
Authority / $25  = buy_btn_1ThUOcGJtywdCBcEpfMequal
```

Stripe webhook:

```text
https://threestarops.com/api/stripe/webhook
```

Add `STRIPE_WEBHOOK_SECRET` as a Cloudflare Pages environment variable.

## Demo logins

```text
boutique@chefledger.test / ChefLedger123!
steady@chefledger.test / ChefLedger123!
highvolume@chefledger.test / ChefLedger123!
```

Demo users are seeded with fake vendors, products, plates, stations, locations, and fake YTD POS history for forecaster testing.


## v66 hotfix

Full-file rewrites included `functions/api/[[path]].js`, `static/app.js`, and `README.md`. This release lowers the Cloudflare PBKDF2 password hashing iteration count to the supported maximum of 100,000 and adds a dedicated `/api/auth/demo` route so the main landing-page demo buttons open active authority-tier demo accounts without relying on a password checkout flow.


## v67 Cloudflare create-account/cache hotfix

Full-file rewrites included `static/index.html`, `static/app.js`, `functions/api/[[path]].js`, and `README.md`. This release keeps PBKDF2 at Cloudflare's supported maximum of 100,000 iterations, updates the static asset cache-busting query strings to `v=67`, and makes the Create Account form immediately move a newly registered user to the subscription checkout lock screen instead of waiting on a follow-up session reload. Demo buttons continue to use `/api/auth/demo` for direct demo account login.
