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
   DB_NAME=your_db_name
   DB_USER=your_db_user
   DB_PASSWORD=your_secure_password
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

## Useful Commands

- **Stop containers**
  ```bash
  docker compose down
  ```

- **Stop + remove volumes (reset DB/data)**
  ```bash
  docker compose down -v
  ```

- **View logs**
  ```bash
  docker compose logs -f
  ```

## Notes

- Backend runs DB migrations automatically at startup.
- Static files are collected automatically at startup.
- See inventory-specific documentation here: [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)

## Delivery Checklist Tracking

Use this file as the entry point and maintain implementation progress in:
- [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)

That file includes:
- Phase-wise checklists (Phase 1–4)
- Role-wise API matrix
- Current completion snapshot (Done / Partial / Not Started)
- A handoff-friendly format to avoid duplicate work
