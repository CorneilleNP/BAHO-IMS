@echo off
REM Wrapper so db.ps1 runs even when PowerShell script execution is disabled.
REM Usage: scripts\db.cmd start ^| stop ^| status ^| psql ^| tables ^| pgadmin
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0db.ps1" %*
