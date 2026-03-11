# Inventory

Inventory includes REST APIs (`/api/inventory/`), reporting APIs (`/api/reports/`), and mobile HTMX pages (`/inventory/mobile/`).

## Progress Snapshot
- Phase 1 (Core workflow): ██████████ 100%
- Phase 2 (Returns/tracking): ██████████ 100%
- Phase 3 (Manual reporting): ██████████ 100%
- Phase 4 (Analytics UX): ████████░░ 80%

## Quick Start (Docker)
```bash
# from repo root
cp .env.example .env
docker compose up --build
```

## REST APIs (`/api/inventory/`)
- `categories/`, `categories/<id>/`
- `items/`, `items/low-stock/`, `items/<id>/`, `items/<id>/history/`, `items/<id>/stock-entries/`
- `stock-entries/`
- `requests/`, `requests/<id>/`, `requests/<id>/review/`, `requests/<id>/issue/`
- `purchase-requests/`, `purchase-requests/<id>/decision/`
- `issues/`, `issues/<id>/return/`, `issues/<id>/finalize/`
- `activity/users/<id>/`, `dashboard/`
- retained legacy endpoints:
  - `api/items/<id>/adjust-stock/`
  - `api/stats/`
  - `api/requests/<id>/approve/`, `api/requests/<id>/reject/`, `api/requests/<id>/mark-urgent/`

## Reporting APIs used by Inventory Manager (`/api/reports/`)
- `inventory/`, `requests/`, `activity-trend/`, `area-issues/`
- `monthly/`, `monthly/generate/`, `monthly/<id>/`, `monthly/<id>/csv/`, `monthly/<id>/pdf/`
- `consumption/`, `consumption/generate/`, `consumption/<id>/`
- `consumption/<id>/csv/items/`, `consumption/<id>/csv/requesters/`

## API Access Map
| Endpoint | Method | Admin | Inventory Manager | Supervisor/Caretaker |
|---|---|---|---|---|
| `/api/inventory/items/` | GET | ✅ | ✅ | ✅ |
| `/api/inventory/items/` | POST | ✅ | ❌ | ❌ |
| `/api/inventory/requests/` | GET | ✅ | ✅ | ✅ (own scope) |
| `/api/inventory/requests/` | POST | ❌ | ❌ | ✅ |
| `/api/inventory/requests/<id>/review/` | POST | ❌ | ✅ | ❌ |
| `/api/inventory/requests/<id>/issue/` | POST | ❌ | ✅ | ❌ |
| `/api/inventory/issues/` | GET | ✅ | ✅ | ✅ (own scope) |
| `/api/inventory/issues/<id>/return/` | POST | ❌ | ✅ | ❌ |
| `/api/inventory/issues/<id>/finalize/` | POST | ❌ | ❌ | ✅ |
| `/api/inventory/purchase-requests/` | GET/POST | ✅ | ✅ | ❌ |
| `/api/inventory/purchase-requests/<id>/decision/` | POST | ✅ | ✅ | ❌ |
| `/api/inventory/dashboard/` | GET | ✅ | ❌ | ❌ |
| `/api/reports/activity-trend/` | GET | ✅ | ✅ | ❌ |
| `/api/reports/monthly/generate/` | POST | ✅ | ✅ | ❌ |
| `/api/reports/area-issues/` | GET | ✅ | ✅ | ❌ |

## Mobile HTMX routes (`/inventory/mobile/`)
- `login/`, `logout/`, `/` (dashboard)
- `list/`, `request/`, `my-requests/`, `manager-requests/`
- `issued/`, `stock-log/`, `reports/`
- `profile/`, `change-password/`
- `approve/<id>/`, `reject/<id>/`, `issue/<id>/`
