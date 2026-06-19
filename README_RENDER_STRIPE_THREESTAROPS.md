# ThreeStarOps Render + Stripe Setup

Path: `chef-ledger-operational/README_RENDER_STRIPE_THREESTAROPS.md`

This build is designed so the full app runs on Render, not only as a static Cloudflare Pages preview.

## Render settings

Use the GitHub repo:

```text
FaytSystems/threestarops
```

Recommended Render settings:

```text
Runtime: Python
Build Command: python -m pip install --upgrade pip && pip install -r requirements.txt
Start Command: python server.py
Environment: PYTHON_VERSION=3.11.9
```

`server.py` automatically reads Render's `$PORT` and binds to `0.0.0.0` when deployed.

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

## Render environment variables

Add these in Render → Service → Environment:

```text
PYTHON_VERSION=3.11.9
CHEF_LEDGER_ALLOW_LOCAL_SUBSCRIPTION_ACTIVATE=false
CHEF_LEDGER_STRIPE_PUBLISHABLE_KEY=pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC
CHEF_LEDGER_STRIPE_BUY_BUTTON_STARTER=buy_btn_1ThUNgGJtywdCBcETVYJjTha
CHEF_LEDGER_STRIPE_BUY_BUTTON_KITCHEN=buy_btn_1ThUPGGJtywdCBcET4iAdZqh
CHEF_LEDGER_STRIPE_BUY_BUTTON_CHEF=buy_btn_1ThUPTGJtywdCBcEBqr6zQiM
CHEF_LEDGER_STRIPE_BUY_BUTTON_AUTHORITY=buy_btn_1ThUOcGJtywdCBcEpfMequal
STRIPE_WEBHOOK_SECRET=whsec_...
```

Do not commit a Stripe `sk_live...` secret key to GitHub. The publishable `pk_live...` key is safe for frontend Buy Buttons.

## Stripe webhook endpoint

After Render deploys, use this webhook endpoint in Stripe:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/stripe/webhook
```

After the custom domain points to Render, use:

```text
https://threestarops.com/api/stripe/webhook
```

Listen for these events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

Copy the webhook signing secret from Stripe and put it in Render as:

```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

## How tier unlock works

1. User creates a restaurant profile.
2. Account is saved as `pending_checkout`.
3. The subscription lock page renders the four Stripe Buy Buttons.
4. Each Stripe button receives a `client-reference-id` like:

```text
chefledger|team=1|user=2|tier=starter
```

5. Stripe sends `checkout.session.completed` to `/api/stripe/webhook`.
6. The server verifies the webhook and updates the team to the paid tier.
7. Login/session refresh unlocks the tier-specific tools.

## Cloudflare domain

Once Render works at the `.onrender.com` URL, remove `threestarops.com` and `www.threestarops.com` from Cloudflare Pages custom domains. Then point Cloudflare DNS to Render according to Render's custom-domain instructions.

