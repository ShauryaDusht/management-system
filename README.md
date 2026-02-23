# Management System

## Requirements
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Setup

**1. Clone the repo**
```bash
git clone 
cd management-system
```

**2. Create your env file**
```bash
cp .env.example .env
```

**3. Run**
```bash
docker compose up --build
```

**4. Create superuser** (first time only, in a new terminal)
```bash
docker compose exec backend python manage.py createsuperuser
```

## URLs
| Service | URL |
|---|---|
| React Admin | http://localhost:5173 |
| Mobile Web (HTMX) | http://localhost:8000/mobile/ |
| API | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |

## Stop
```bash
docker compose down
```

## Reset database
```bash
docker compose down -v
```