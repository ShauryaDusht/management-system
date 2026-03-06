# Data Sync Guide (Teammates)

This project includes shared data for:
- Inventory items/categories
- Housekeeping areas, user-area mappings, workers, schedules
- Users (admin/manager/inventory_manager/supervisor/caretaker)

Default password for seeded accounts:
- `IITGN@2025`

Core portal accounts:
- `admin` (admin)
- `estate.manager` (manager)
- `hostel.manager` (manager)
- `inv.manager` (inventory_manager)

## Option A (Recommended): Auto bootstrap via Docker

```bash
docker compose down -v
docker compose up --build -d
```

`backend` startup runs:
- `python manage.py migrate`
- `python manage.py seed_all_data`

So your teammate gets the same baseline dataset automatically.

## Option B (Manual load on existing environment)

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_all_data
docker compose exec backend python manage.py loaddata fixtures/users_hk.json
docker compose exec backend python manage.py loaddata fixtures/hk_user_areas.json
```

## Refresh shared fixtures before push (maintainer)

```bash
docker compose exec backend python manage.py seed_all_data --dump-fixtures
```

This updates:
- `backend/fixtures/users_hk.json`
- `backend/fixtures/housekeeping.json`
- `backend/fixtures/hk_user_areas.json`

Both files are stored as UTF-8 for reliable `loaddata`.
