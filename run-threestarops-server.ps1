# Path: chef-ledger-operational/run-threestarops-server.ps1
# Purpose: Run the backend on a server/VPS network interface instead of only localhost.
# Local app default is 127.0.0.1:8787. For hosting behind a reverse proxy, use 0.0.0.0.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$env:CHEF_LEDGER_HOST = "0.0.0.0"
if (-not $env:CHEF_LEDGER_PORT) {
    $env:CHEF_LEDGER_PORT = "8787"
}

python .\server.py
