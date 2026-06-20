param(
  [string]$RepoPath = "$env:USERPROFILE\Downloads\threestarops_repo",
  [string]$ZipPath = "$env:USERPROFILE\Downloads\chef-ledger-operational-cloudflare-full-v65.zip"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ZipPath)) {
  throw "ZIP not found: $ZipPath"
}

$work = Join-Path $env:TEMP "threestarops_v65_install"
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work | Out-Null
Expand-Archive -Path $ZipPath -DestinationPath $work -Force

$src = Join-Path $work "chef-ledger-operational"
if (!(Test-Path $src)) { throw "Expected folder missing inside ZIP: chef-ledger-operational" }
if (!(Test-Path $RepoPath)) { throw "Repo path not found: $RepoPath. Clone https://github.com/FaytSystems/threestarops.git there first." }

robocopy $src $RepoPath /E /XD ".git" "__pycache__" ".venv" /XF "*.db" "*.sqlite" "*.sqlite3"

Set-Location $RepoPath
git status
Write-Host "Next commands:" -ForegroundColor Green
Write-Host "git add ."
Write-Host "git commit -m 'Make Cloudflare D1 R2 app fully functional'"
Write-Host "git push origin main"
