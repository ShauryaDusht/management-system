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
   git clone https://github.com/ShauryaDusht/management-system/
   cd management-system
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Update database values in `.env`**
   ```env
   SECRET_KEY=atleast-64-length-bit-string-using-base-64-characters
   # for development purpose only
   DEBUG=True 
   ALLOWED_HOSTS=localhost,127.0.0.1

   # Database setting
   DB_NAME=my_db
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_PORT=5432
   DB_HOST=localhost
   DB_ENGINE=django.db.backends.postgresql
   
   CORS_ALLOWED_ORIGINS=http://localhost:5173
   ```

4. **Build and start all services**
   To view which container are running currently
   ```bash
   docker compose ps
   ```
   To only build docker container
   ```bash
   docker compose build
   ```

   To run docker container only in detached mode (background)
   ```bash
   docker compose up -d
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

## Useful Commands
- **To run docker container**
   ```bash
   docker compose up
   ```
- **To run and build together docker container**
   ```bash
   docker compose up -d --build
   ```
- **To view logs of a container**
   ```bash
   docker compose logs <container-name>
   ```
- **To stop the containers**
   ```bash
   docker compose down
   ```

- **To stop containers and delete db(redis/postgre)**
   ```bash
   docker compose down -v
   ```

## Notes

- Backend runs DB migrations automatically at startup.
- Static files are collected automatically at startup.
- See inventory-specific documentation here: [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)

---

## Team Sync — Get Everyone's Data Updated

When someone pushes new code or data, every teammate runs:

**Step 1 — Pull latest code**
```bash
git pull origin main
```

**Step 2 — Rebuild Docker containers**
```bash
docker compose down
docker compose up --build -d
```

**Step 3 — Run setup script (one command does everything)**
```bash
docker compose exec backend sh setup_team.sh
```

This runs migrations + loads all inventory data + seeds 74 real items. ✅

**Default Login:**
URL:      http://localhost:5173
Username: admin
Password: admin12345

**If setup script fails, run manually:**
```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py loaddata backend/fixtures/inventory.json
docker compose exec backend python manage.py seed_inventory
docker compose exec backend python manage.py createsuperuser
```

**Complete reset (if everything is broken):**
```bash
docker compose down -v
docker compose up --build -d
docker compose exec backend sh setup_team.sh
docker compose exec backend python manage.py createsuperuser
```
> ⚠️ down -v deletes your local database. Only use as last resort.
