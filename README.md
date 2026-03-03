# Management System

This repository contains a Dockerized management system with:
- Django backend API
- React admin frontend
- Inventory workflows (API + mobile HTMX pages)
- PostgreSQL + Redis

## Project Structure

- `backend/` — Django project and APIs
- `frontend-admin/` — React admin UI
- `backend/apps/inventory/README.md` — inventory module endpoints + role-wise functionality

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose)
- Git

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
| React Admin Frontend | http://localhost:5173 |
| Inventory Mobile (HTMX) | http://localhost:8000/inventory/mobile/ |
| http://localhost:8000/housekeeping/login/ |

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
- See inventory-specific documentation here: [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)
