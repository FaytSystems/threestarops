# ThreeStarOps GitHub Upload Package

Path: `chef-ledger-operational/README.md`

This package connects the current Chef Ledger / ThreeStarOps operational app to a GitHub repository for the domain:

```text
threestarops.com
```

## Important hosting note

This app is a Python backend app (`server.py`). GitHub is the right place to store the code, version updates, and connect deployment automation.

GitHub Pages is only suitable for a static landing/marketing page. It will not run this Python backend by itself. For the live app, deploy the repo to a VPS or app host, then point `threestarops.com` to that host.

## Fast GitHub upload flow

1. Create a new empty GitHub repository named:

```text
threestarops
```

Do not initialize it with a README if you want the first push to be clean.

2. Extract this ZIP using your normal pattern:

```powershell
cd "C:\Users\ursamajor\Downloads"

Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

Unblock-File ".\chef-ledger-operational-threestarops-github-v62.zip"

Remove-Item ".\chef-ledger-operational" -Recurse -Force -ErrorAction SilentlyContinue

Expand-Archive -Path ".\chef-ledger-operational-threestarops-github-v62.zip" -DestinationPath "." -Force

cd ".\chef-ledger-operational"
```

3. Push to GitHub:

```powershell
powershell -ExecutionPolicy Bypass -File ".\connect-threestarops-github.ps1" -RemoteUrl "https://github.com/YOUR_GITHUB_USERNAME/threestarops.git"
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username or organization.

## Run locally after extracting

```powershell
cd "C:\Users\ursamajor\Downloads\chef-ledger-operational"
powershell -ExecutionPolicy Bypass -File ".\run.ps1"
```

Open:

```text
http://127.0.0.1:8787
```

## Run on a Windows VPS / server

```powershell
cd "C:\Path\To\chef-ledger-operational"
powershell -ExecutionPolicy Bypass -File ".\run-threestarops-server.ps1"
```

That script sets:

```text
CHEF_LEDGER_HOST=0.0.0.0
CHEF_LEDGER_PORT=8787
```

For a production public website, place Nginx/Caddy/IIS or another reverse proxy in front of the Python app and serve HTTPS on `threestarops.com`.

## Domain setup summary

For a real hosted backend:

```text
threestarops.com  -> A record -> your VPS/app host IP
www               -> CNAME    -> threestarops.com
```

For a static GitHub Pages marketing page only, GitHub can use the included `CNAME` file containing:

```text
threestarops.com
```

## Included Stripe Buy Button mapping

```text
Starter / $10    = buy_btn_1ThUNgGJtywdCBcETVYJjTha
Kitchen / $14    = buy_btn_1ThUPGGJtywdCBcET4iAdZqh
Chef / $19       = buy_btn_1ThUPTGJtywdCBcEBqr6zQiM
Authority / $25  = buy_btn_1ThUOcGJtywdCBcEpfMequal
```

Frontend publishable key currently used for Stripe Buy Buttons:

```text
pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC
```

Do not put any Stripe secret key beginning with `sk_live_` into GitHub.

## Files added for GitHub/domain upload

```text
chef-ledger-operational/.gitignore
chef-ledger-operational/CNAME
chef-ledger-operational/connect-threestarops-github.ps1
chef-ledger-operational/install-and-push-threestarops-from-downloads.ps1
chef-ledger-operational/run-threestarops-server.ps1
chef-ledger-operational/README_GITHUB_UPLOAD_THREESTAROPS.md
chef-ledger-operational/README.md
```
