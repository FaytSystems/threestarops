# Path: chef-ledger-operational/connect-threestarops-github.ps1
# Purpose: Initialize this Chef Ledger / ThreeStarOps folder as a Git repo and push it to GitHub.
# Usage:
#   powershell -ExecutionPolicy Bypass -File ".\connect-threestarops-github.ps1" -RemoteUrl "https://github.com/YOUR_GITHUB_USERNAME/threestarops.git"

param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteUrl,

    [string]$Branch = "main",

    [string]$CommitMessage = "Upload ThreeStarOps Chef Ledger app"
)

$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "=== ThreeStarOps GitHub Upload ==="
Write-Host "Working folder: $PSScriptRoot"
Write-Host "Remote URL:     $RemoteUrl"
Write-Host "Branch:         $Branch"
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not available in PATH. Install Git for Windows, then run this again."
}

# Remove Python cache folders before upload.
Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Path ".git")) {
    git init
}

git branch -M $Branch

$existingOrigin = ""
try {
    $existingOrigin = git remote get-url origin 2>$null
} catch {
    $existingOrigin = ""
}

if ([string]::IsNullOrWhiteSpace($existingOrigin)) {
    git remote add origin $RemoteUrl
} else {
    git remote set-url origin $RemoteUrl
}

git add -A

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No new changes staged for commit. Continuing to push current branch..."
} else {
    git commit -m $CommitMessage
}

git push -u origin $Branch

Write-Host ""
Write-Host "DONE: ThreeStarOps files pushed to GitHub."
Write-Host "Next: connect deployment host to this repo, then point threestarops.com DNS to the deployment host."
