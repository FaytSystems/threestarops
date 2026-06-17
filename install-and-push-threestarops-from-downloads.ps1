# Path: chef-ledger-operational/install-and-push-threestarops-from-downloads.ps1
# Purpose: One-shot local install pattern + GitHub push for the ThreeStarOps repo package.
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\UrsaMajor\Downloads\chef-ledger-operational\install-and-push-threestarops-from-downloads.ps1" -RemoteUrl "https://github.com/YOUR_GITHUB_USERNAME/threestarops.git"

param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteUrl
)

$ErrorActionPreference = "Stop"

Set-Location "C:\Users\ursamajor\Downloads"

Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

Set-Location ".\chef-ledger-operational"

powershell -ExecutionPolicy Bypass -File ".\connect-threestarops-github.ps1" -RemoteUrl $RemoteUrl
