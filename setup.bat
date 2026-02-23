@echo off
echo ============================================================
echo   Management System - Create Missing Files
echo ============================================================
echo.

set ROOT=C:\Users\shaur\OneDrive\Desktop\management-system
set BACK=%ROOT%\backend
set FRONT=%ROOT%\frontend-admin

:: ── BACKEND FOLDERS ──────────────────────────────────────────
echo Creating missing folders...
mkdir "%BACK%\config\settings"                                          2>nul
mkdir "%BACK%\apps\core"                                                2>nul
mkdir "%BACK%\apps\inventory\templates\inventory\partials"              2>nul
mkdir "%BACK%\templates\components"                                     2>nul

:: ── FRONTEND FOLDERS ─────────────────────────────────────────
mkdir "%FRONT%\src\api"                                                 2>nul
mkdir "%FRONT%\src\layout"                                              2>nul
mkdir "%FRONT%\src\modules\inventory"                                   2>nul
mkdir "%FRONT%\src\modules\horticulture"                                2>nul
mkdir "%FRONT%\src\modules\housekeeping"                                2>nul
mkdir "%FRONT%\src\shared\components"                                   2>nul
mkdir "%FRONT%\src\shared\hooks"                                        2>nul
echo    OK

:: ── CONFIG ───────────────────────────────────────────────────
echo Creating config files...
type nul > "%BACK%\config\settings\__init__.py"
type nul > "%BACK%\config\settings\base.py"
type nul > "%BACK%\config\settings\dev.py"
type nul > "%BACK%\config\settings\prod.py"
type nul > "%BACK%\config\celery.py"
type nul > "%BACK%\config\__init__.py"
echo    OK

:: ── CORE ─────────────────────────────────────────────────────
echo Creating core files...
type nul > "%BACK%\apps\core\__init__.py"
type nul > "%BACK%\apps\core\permissions.py"
type nul > "%BACK%\apps\core\utils.py"
echo    OK

:: ── USERS ────────────────────────────────────────────────────
echo Creating users files...
type nul > "%BACK%\apps\users\serializers.py"
type nul > "%BACK%\apps\users\urls.py"
echo    OK

:: ── INVENTORY ────────────────────────────────────────────────
echo Creating inventory files...
type nul > "%BACK%\apps\inventory\serializers.py"
type nul > "%BACK%\apps\inventory\api_views.py"
type nul > "%BACK%\apps\inventory\htmx_views.py"
type nul > "%BACK%\apps\inventory\htmx_urls.py"
type nul > "%BACK%\apps\inventory\urls.py"
type nul > "%BACK%\apps\inventory\templates\inventory\dashboard.html"
type nul > "%BACK%\apps\inventory\templates\inventory\request_item.html"
type nul > "%BACK%\apps\inventory\templates\inventory\my_requests.html"
type nul > "%BACK%\apps\inventory\templates\inventory\partials\item_list.html"
type nul > "%BACK%\apps\inventory\templates\inventory\partials\request_form.html"
echo    OK

:: ── HORTICULTURE ─────────────────────────────────────────────
echo Creating horticulture files...
type nul > "%BACK%\apps\horticulture\serializers.py"
type nul > "%BACK%\apps\horticulture\urls.py"
echo    OK

:: ── HOUSEKEEPING ─────────────────────────────────────────────
echo Creating housekeeping files...
type nul > "%BACK%\apps\housekeeping\serializers.py"
type nul > "%BACK%\apps\housekeeping\urls.py"
echo    OK

:: ── REPORTS ──────────────────────────────────────────────────
echo Creating reports files...
type nul > "%BACK%\apps\reports\generators.py"
type nul > "%BACK%\apps\reports\tasks.py"
type nul > "%BACK%\apps\reports\urls.py"
echo    OK

:: ── TEMPLATES ────────────────────────────────────────────────
echo Creating template files...
type nul > "%BACK%\templates\base.html"
type nul > "%BACK%\templates\components\navbar.html"
type nul > "%BACK%\templates\components\alerts.html"
echo    OK

:: ── BACKEND ROOT ─────────────────────────────────────────────
echo Creating backend root files...
type nul > "%BACK%\Dockerfile"
type nul > "%BACK%\requirements.txt"
echo    OK

:: ── FRONTEND ─────────────────────────────────────────────────
echo Creating frontend files...
type nul > "%FRONT%\src\api\client.js"
type nul > "%FRONT%\src\layout\AdminLayout.jsx"
type nul > "%FRONT%\src\layout\Header.jsx"
type nul > "%FRONT%\src\modules\inventory\InventoryPage.jsx"
type nul > "%FRONT%\src\modules\inventory\ItemTable.jsx"
type nul > "%FRONT%\src\modules\inventory\ThresholdAlert.jsx"
type nul > "%FRONT%\src\modules\horticulture\.gitkeep"
type nul > "%FRONT%\src\modules\housekeeping\.gitkeep"
type nul > "%FRONT%\src\shared\components\.gitkeep"
type nul > "%FRONT%\src\shared\hooks\.gitkeep"
type nul > "%FRONT%\src\App.jsx"
type nul > "%FRONT%\Dockerfile"
echo    OK

:: ── ROOT ─────────────────────────────────────────────────────
echo Creating root files...
type nul > "%ROOT%\docker-compose.yml"
type nul > "%ROOT%\docker-compose.override.yml"
echo    OK

echo.
echo ============================================================
echo   All missing files created. No content written.
echo   Run this and then ask for file contents one by one.
echo ============================================================
pause