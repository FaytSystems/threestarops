Write-Host "ThreeStarOps Cloudflare setup helper" -ForegroundColor Cyan
Write-Host "1) npm install"
Write-Host "2) npx wrangler login"
Write-Host "3) npx wrangler d1 create threestarops-db"
Write-Host "4) Paste database_id into wrangler.toml or add binding in Cloudflare Pages dashboard"
Write-Host "5) npx wrangler d1 execute threestarops-db --remote --file migrations/0001_cloudflare_d1_auth.sql"
Write-Host "6) npx wrangler r2 bucket create threestarops-files"
Write-Host "7) In Cloudflare Pages > threestarops > Settings > Bindings add D1 binding DB and R2 binding FILES_BUCKET"
Write-Host "8) Set STRIPE_WEBHOOK_SECRET in Pages environment variables after creating the Stripe webhook"
