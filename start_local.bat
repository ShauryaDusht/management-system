@echo off
title IITGN Management System - Local Runner
cd /d "%~dp0"

echo ==========================================================
echo    IITGN Campus Management System - Local Launcher
echo ==========================================================

echo [1/4] Freeing ports 8000 and 5173...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo [2/4] Starting Django Backend (Port 8000)...
start "IITGN Backend (Django)" /min /d "%~dp0backend" cmd /c ".\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"

echo [3/4] Starting React Admin Frontend (Port 5173)...
start "IITGN Frontend (Vite)" /min /d "%~dp0frontend-admin" cmd /c "node dev-server.js"

echo [4/4] Waiting for services to initialize...
powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:5173/admin/substation'"

echo ==========================================================
echo    Services are running!
echo    - Admin SPA:       http://localhost:5173/admin/
echo    - Substation Log:  http://localhost:5173/admin/substation
echo    - WTP / STP Log:   http://localhost:5173/admin/wtp
echo    - Staff Mobile:    http://localhost:8000/portal/login/
echo    - WTP Mobile PWA:  http://localhost:8000/wtp/dashboard/
echo    - Backend API:     http://127.0.0.1:8000/
echo ==========================================================
exit /b 0
