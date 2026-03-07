# Management System

This repository contains a Dockerized management system with:
- Django backend API
- React admin frontend (admin-only)
- Inventory workflows (API + mobile HTMX pages)
- PostgreSQL + Redis

## Entry Points

The system now uses two entry points:

- `/admin-portal/` -> React SPA for `admin` role only (dev server: `http://localhost:5173`)
- `/portal/login/` -> Unified HTMX login for all non-admin staff

After `/portal/login/`, users are redirected by role:

- `inventory_manager` -> `/inventory/mobile/`
- `housekeeping_manager` -> `/housekeeping/dashboard/`
- `horticulture_manager` -> `/horticulture/dashboard/` (placeholder)
- `supervisor` / `caretaker` -> `/housekeeping/dashboard/`

## Roles

- `admin`
- `inventory_manager`
- `housekeeping_manager`
- `horticulture_manager`
- `supervisor`
- `caretaker`

## Module Documentation

- Inventory: [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)
- Housekeeping: [`backend/apps/housekeeping/README.md`](backend/apps/housekeeping/README.md)

## Quick Start (Docker)

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd management-system
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Update database values in `.env`**
   ```env
   SECRET_KEY=any-random-string-here
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1

   DB_NAME=mydb
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_PORT=5432
   DB_HOST=localhost
   DB_ENGINE=django.db.backends.postgresql

   CORS_ALLOWED_ORIGINS=http://localhost:5173
   ```

4. **Build and start all services**
   ```bash
   docker compose up --build
   ```

5. **Create first admin user** (first run only)
   ```bash
   docker compose exec backend python manage.py createsuperuser
   ```

## Service URLs

| Service | URL |
|---|---|
| Django Backend | http://localhost:8000 |
| API Base | http://localhost:8000/api |
| Django Admin | http://localhost:8000/admin/ |
| React Admin SPA (dev) | http://localhost:5173 |
| Staff Portal Login | http://localhost:8000/portal/login/ |
| Staff Portal Root | http://localhost:8000/portal/ |
| Inventory Mobile (HTMX) | http://localhost:8000/inventory/mobile/ |
| Housekeeping Dashboard (HTMX) | http://localhost:8000/housekeeping/dashboard/ |
| Horticulture Dashboard (placeholder) | http://localhost:8000/horticulture/dashboard/ |

## Contribution Workflow (Required)

Direct commits to protected branches are not allowed. Every change must go through a Pull Request.
1. Create a feature/fix branch from `main`.
2. Push your branch and open a Pull Request.
3. The CI review bot runs automatically and leaves PR feedback.
4. Address all bot feedback and failing checks.
5. Repository owner reviews the PR.
6. After owner approval, the PR is merged.

### Rules for contributors

- Never push directly to `main`.
- Keep PRs focused and small where possible.
- Include a clear PR description (what changed, why, how tested).
- Resolve bot comments before requesting final review.

## Notes

- Backend runs DB migrations automatically at startup.
- Static files are collected automatically at startup.
- React SPA access is now admin-only; non-admin users are redirected to `/portal/`.
- Housekeeping module docs include HTMX + API coverage: [`backend/apps/housekeeping/README.md`](backend/apps/housekeeping/README.md)
