# Path: chef-ledger-operational/run.ps1
# Runs the Chef Ledger operational MVP on Windows PowerShell.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
python .\server.py
