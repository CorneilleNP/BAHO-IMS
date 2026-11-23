<#
  Local demo on this PC: database, backend, website and the Android app in the
  emulator, all connected. Run: scripts\demo.cmd   (add -NoEmulator to skip the phone)

  Afterwards:
    Website      http://localhost:5173
    Android app  emulator window; on the login screen tap "Server: ... Change"
                 and enter http://10.0.2.2:8000  (10.0.2.2 = this PC, seen from the emulator)
    Real phone   same Wi-Fi; install mobile\android\...\app-release.apk, server
                 http://<this PC's IP>:8000 (shown below). Allow Python through the
                 Windows firewall when asked.
    Sign in      clerk.gitoki@baho.local / BahoDev2026!  (all dev users: see README)
    Offline demo in the emulator: swipe down from the top > Airplane mode, record
                 farmers/GRNs, switch it off again and watch "N waiting" turn to "Synced".
#>
param([switch]$NoEmulator)
$ErrorActionPreference = 'Stop'

$Repo  = Split-Path $PSScriptRoot -Parent
$Tools = 'F:\baho-tools'
$Node  = Join-Path $HOME 'tools\node'
$Py    = Join-Path $Repo 'backend\.venv\Scripts\python.exe'
$Sdk   = Join-Path $Tools 'android-sdk'
$Adb   = Join-Path $Sdk 'platform-tools\adb.exe'
$Apk   = Join-Path $Repo 'mobile\android\app\build\outputs\apk\release\app-release.apk'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

Step 'Database'
& (Join-Path $PSScriptRoot 'db.ps1') start
$env:PGPASSWORD = 'postgres'
& (Join-Path $HOME 'tools\pgsql\bin\createdb.exe') -h localhost -U postgres baho_ims 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host 'created database baho_ims' }
$global:LASTEXITCODE = 0

Step 'Backend: migrations and dev setup'
if (-not (Test-Path $Py)) { throw "Python environment missing: $Py (see README, Backend)." }
Push-Location (Join-Path $Repo 'backend')
& $Py manage.py migrate --noinput
& $Py manage.py seed_dev
Pop-Location

Step 'Backend server (new window) on port 8000, reachable from the emulator and phones'
$backendCmd = "Set-Location '$Repo\backend'; `$env:DJANGO_ALLOWED_HOSTS='*'; & '$Py' manage.py runserver 0.0.0.0:8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCmd

Step 'Website (new window) on http://localhost:5173'
$webCmd = "Set-Location '$Repo\frontend'; `$env:PATH='$Node;' + `$env:PATH; if (-not (Test-Path node_modules)) { npm install }; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $webCmd

if (-not $NoEmulator) {
  Step 'Android emulator with the app'
  $env:ANDROID_SDK_ROOT = $Sdk
  $env:ANDROID_AVD_HOME = Join-Path $Tools 'avd'
  $running = (& $Adb devices) -match '^emulator-\d+\s+device'
  if (-not $running) {
    Start-Process (Join-Path $Sdk 'emulator\emulator.exe') -ArgumentList '-avd', 'BahoPhone', '-gpu', 'auto', '-no-snapshot-save'
    Write-Host 'starting the emulator (the first start can take a few minutes)...'
    & $Adb wait-for-device
    do { Start-Sleep -Seconds 3 } until ((& $Adb shell getprop sys.boot_completed) -match '1')
  }
  & $Adb shell cmd connectivity airplane-mode disable | Out-Null
  if (Test-Path $Apk) {
    & $Adb install -r $Apk | Out-Null
    & $Adb shell am start -n rw.baho.ims/.MainActivity | Out-Null
    Write-Host 'Baho IMS installed and opened in the emulator.'
  } else {
    Write-Host "APK not built yet: $Apk (see mobile\README.md)" -ForegroundColor Yellow
  }
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1).IPAddress

Step 'Ready'
Write-Host "Website:         http://localhost:5173"
Write-Host "App in emulator: login screen > Server: Change > http://10.0.2.2:8000"
if ($ip) { Write-Host "Real phone:      same Wi-Fi, server http://${ip}:8000" }
Write-Host "Sign in:         clerk.gitoki@baho.local / BahoDev2026!"
Write-Host "Offline demo:    emulator > swipe down > Airplane mode on, work, then off: it syncs."
