# Housekeeping

Housekeeping includes HTMX pages (`/housekeeping/`) and JSON APIs (`/api/housekeeping/`).

## HTMX routes (`/housekeeping/`)
- `login/`, `logout/`, `dashboard/`
- `task/<record_id>/mark/`, `extra-work/`, `schedule/`
- `attendance/`, `attendance/sunday-incharge/`, `attendance/assign-reliever/`
- `stock/`, `stock/request/`
- `profile/`, `alerts/`

## JSON APIs (`/api/housekeeping/`)
- Core data + operations:
  - `areas/`
  - `workers/`, `workers/create/`, `workers/<id>/` (PATCH, DELETE)
  - `daily-records/`, `schedule-templates/`, `attendance-summary/`
  - `stock-requests/`, `stock-requests/<id>/status/`
  - `assign-area-task/`, `promote-task-to-daily/`
  - `alerts/`, `dashboard-summary/`
- Reporting:
  - `workers/reports/combined/csv/`
  - `workers/<id>/report/`, `workers/<id>/report/csv/`, `workers/<id>/report/regenerate/`
  - `supervisors/<id>/report/`, `supervisors/<id>/report/csv/`, `supervisors/<id>/report/regenerate/`
- Workforce governance:
  - `worker-selection-requests/`, `worker-selection-requests/<id>/decision/`
  - `incharge-assignments/`, `incharge-assignments/<uuid>/decision/`, `incharge-assignments/report/`
  - `leave-requests/`, `incharge-notifications/`

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
| `/api/housekeeping/workers/<id>/report/` | GET | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/workers/<id>/report/csv/` | GET | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/supervisors/<id>/report/` | GET | ✅ | ✅ | ❌ | ❌ |
| `/api/housekeeping/worker-selection-requests/` | GET/POST | ✅ | ✅ | ❌ | ✅ (request own scope) |
| `/api/housekeeping/incharge-assignments/<uuid>/decision/` | POST | ✅ | ✅ | ❌ | ✅ |

