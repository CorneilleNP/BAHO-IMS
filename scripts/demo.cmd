@echo off
REM One-click local demo: database, backend, website, Android emulator with the app.
REM Usage: scripts\demo.cmd            (or: scripts\demo.cmd -NoEmulator)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0demo.ps1" %*
