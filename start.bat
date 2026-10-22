@echo off
echo ==========================================
echo Starting IITGN Campus Management System...
echo ==========================================

cd /d "%~dp0"

echo Applying database migrations...
call .venv\Scripts\python.exe backend\manage.py migrate --noinput

echo Starting Django backend on port 8000...
start "Campus Backend" cmd /k "cd /d %~dp0 && .venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000"

timeout /t 3 /nobreak >nul

echo Starting React Admin Frontend on port 5173...
start "Campus Admin Frontend" cmd /k "cd /d %~dp0frontend-admin && npm run dev"

timeout /t 3 /nobreak >nul

echo Opening browser...
start http://localhost:5173/admin/

echo.
echo Both services launched!
echo Admin Portal: http://localhost:5173/admin/
echo Staff Portal: http://localhost:8000/portal/login/
echo API Root:    http://localhost:8000/api/
