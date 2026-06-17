@echo off
REM Path: chef-ledger-operational\run.bat
REM Runs the Chef Ledger operational MVP on Windows Command Prompt.
cd /d "%~dp0"
python server.py
