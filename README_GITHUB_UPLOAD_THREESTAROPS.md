# GitHub + threestarops.com Deployment Notes

Path: `chef-ledger-operational/README_GITHUB_UPLOAD_THREESTAROPS.md`

## Best architecture

Use one repository:

```text
github.com/YOUR_GITHUB_USERNAME/threestarops
```

Then deploy that repository to one live app host.

Do not build four websites for subscription tiers. Use one app and tier-based feature gates.

## Recommended deployment layout

```text
GitHub repo
  ↓
VPS / app host deploy
  ↓
threestarops.com DNS points to host
  ↓
App reads user subscription tier
  ↓
Menus/tools unlock by tier
```

## GitHub push command

```powershell
cd "C:\Users\ursamajor\Downloads\chef-ledger-operational"

powershell -ExecutionPolicy Bypass -File ".\connect-threestarops-github.ps1" -RemoteUrl "https://github.com/YOUR_GITHUB_USERNAME/threestarops.git"
```

## Domain records

Backend/VPS deployment:

```text
Type: A
Name: @
Value: YOUR_SERVER_IP

Type: CNAME
Name: www
Value: threestarops.com
```

Static GitHub Pages marketing page only:

```text
Repository Settings → Pages → Custom domain → threestarops.com
```

The root `CNAME` file is included for that static Pages case.

## Production warning

The demo SQLite database and demo uploads are included in this prototype package so the app has demo content immediately.

Before real customers:

```text
- move customer files out of git
- use managed database or server-side private database
- use private object storage for uploads
- add Stripe webhook verification
- add HTTPS reverse proxy
- add backups
```
