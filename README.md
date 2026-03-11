# Management System

Dockerized management system with Django backend + React admin frontend.

## Entry Points
- `/admin-portal/` → React SPA for `admin` (dev: `http://localhost:5173`)
- `/portal/login/` → staff login entry for non-admin users

## Staff redirects after `/portal/login/`
- `inventory_manager` → `/inventory/mobile/`
- `housekeeping_manager` → `/housekeeping/dashboard/`
- `horticulture_manager` → `/horticulture/dashboard/`
- `supervisor`, `caretaker` → `/housekeeping/dashboard/`

## Service URLs
- Backend root: http://localhost:8000/
- API root: http://localhost:8000/api/
- Django admin: http://localhost:8000/admin/
- Admin SPA (Vite dev): http://localhost:5173/
- Staff login portal: http://localhost:8000/portal/login/

## Recent Highlights
- Inventory manager flow now includes a stronger issued-items review experience with pending-action handling and improved dashboard visibility.
- Reporting has been expanded for inventory operations (monthly procurement history, CSV/PDF export support, area-wise issued reports, and activity trends).
- Housekeeping and inventory reporting support has expanded with role-oriented CSV workflows and better cross-module visibility from admin dashboards.

## Phase Progress Snapshot
- Phase 1 (Core inventory workflow): ██████████ 100%
- Phase 2 (Returns/tracking/integrity): ██████████ 100%
- Phase 3 (Manual reporting/procurement): ██████████ 100%
- Phase 4 (Advanced analytics/dashboard UX): ████████░░ 80%

## Quick Start (Docker)
1. **Clone the repository**
   ```bash
   git clone https://github.com/ShauryaDusht/management-system/
   cd management-system
   ```
2. **Create environment file**
   ```bash
   cp .env.example .env
   ```
3. **Update environment values (`.env`)**
   ```env
   SECRET_KEY=any-random-string-here
   DEBUG=True   # of course, change to False in production
   ALLOWED_HOSTS=localhost,127.0.0.1

   DB_NAME=fill_these_with_real_name
   DB_USER=fill_these_with_real_name
   DB_PASSWORD=fill_these_with_real_name
   DB_PORT=5432
   DB_HOST=localhost
   DB_ENGINE=django.db.backends.postgresql

   CORS_ALLOWED_ORIGINS=http://localhost:5173 #frontend-admin
   ```
4. **Build and run services**
   ```bash
   docker compose up -d --build
   ```
5. **Create first admin user (only first time)**
   ```bash
   docker compose exec backend python manage.py createsuperuser
   ```

## Module Documentation
- Inventory: [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)
- Housekeeping: [`backend/apps/housekeeping/README.md`](backend/apps/housekeeping/README.md)
