# Housekeeping

Housekeeping includes HTMX pages (`/housekeeping/`) and JSON APIs (`/api/housekeeping/`).

## Progress Snapshot
- Core mobile + records + attendance: ██████████ 100%
- Stock request + alerts + dashboard summary: ██████████ 100%
- Advanced CRUD/admin analytics: ████░░░░░░ 40%

## Quick Start (Docker)
```bash
# from repo root
cp .env.example .env
docker compose up --build
```

## HTMX routes (`/housekeeping/`)
- `login/`, `logout/`, `dashboard/`
- `task/<record_id>/mark/`, `extra-work/`, `schedule/`
- `attendance/`, `attendance/sunday-incharge/`, `attendance/assign-reliever/`
- `stock/`, `stock/request/`
- `profile/`, `alerts/`

## JSON APIs (`/api/housekeeping/`)
- `areas/`
- `workers/`, `workers/create/`, `workers/<id>/` (PATCH, DELETE)
- `daily-records/`, `schedule-templates/`, `attendance-summary/`
- `stock-requests/`, `stock-requests/<id>/status/`
- `assign-area-task/`, `promote-task-to-daily/`
- `alerts/`, `dashboard-summary/`

## API Access Map
| Endpoint | Method | Admin | Housekeeping Manager | Inventory Manager | Supervisor/Caretaker |
|---|---|---|---|---|---|
| `/api/housekeeping/areas/` | GET | ✅ | ✅ | ✅ | ✅ |
| `/api/housekeeping/workers/` | GET | ✅ | ✅ | ✅ | ✅ |
| `/api/housekeeping/workers/create/` | POST | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/workers/<id>/` | PATCH/DELETE | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/daily-records/` | GET | ✅ | ✅ | ✅ | ✅ |
| `/api/housekeeping/stock-requests/` | GET | ✅ | ✅ | ✅ | ✅ (own scope) |
| `/api/housekeeping/stock-requests/<id>/status/` | PUT/PATCH | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/assign-area-task/` | POST | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/promote-task-to-daily/` | POST | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/dashboard-summary/` | GET | ✅ | ✅ | ✅ | ✅ |

## Seed commands
```bash
python manage.py seed_housekeeping
python manage.py seed_all_data
```
