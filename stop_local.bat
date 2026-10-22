@echo off
title Stop IITGN Management System
echo Stopping IITGN Management System services...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo Ports 8000 and 5173 freed.
timeout /t 2 /nobreak >nul
exit /b 0
