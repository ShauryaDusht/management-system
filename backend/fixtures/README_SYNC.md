# Data Sync Guide

The live bootstrap path is command-based now. We keep fixtures only as optional
reference exports for maintainers, not as the main setup path.

Default password for seeded accounts:
- `IITGN@2025`

Core portal accounts:
- `admin` (admin)
- `horticulture.manager` (horticulture_manager)
- `housekeeping.manager` (housekeeping_manager)
- `inv.manager` (inventory_manager)

## Recommended: Docker bootstrap

```bash
docker compose down -v
docker compose up --build -d
```

The backend startup script will:
- apply migrations
- seed data only when the inventory is empty
- sync inventory baseline data
- sync pay codes, names, and housekeeping area staff
- collect static files

## Manual sync on an existing environment

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_all_data
docker compose exec backend python manage.py update_pay_codes --quiet
docker compose exec backend python manage.py update_names --quiet
docker compose exec backend python manage.py sync_guesthouse_director_staff --quiet
```

## Refresh reference fixtures before push

```bash
docker compose exec backend python manage.py seed_all_data --dump-fixtures
```

This refreshes:
- `backend/fixtures/users_hk.json`
- `backend/fixtures/housekeeping.json`
