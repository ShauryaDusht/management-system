# Housekeeping Module — Scope, Checklist & Role-wise API

This document is the **single source of truth** for housekeeping scope, mobile HTMX flows, and API coverage.
Use it during standups/handoffs to avoid duplicate work and keep implementation status visible.

---

## Status Legend

- ✅ **Done** — implemented and currently available.
- 🟡 **Partial** — implemented with constraints or limited surface.
- ⬜ **Not Started** — planned, not implemented.

---

## Coordination Checklist System (How to Use)

When starting any housekeeping task:
1. Find the matching item below.
2. Add owner/date in your task/PR notes.
3. Update status as work progresses.
4. Link PR/commit references.

---

## Feature Snapshot

### Core Models
- ✅ `HKArea` + `HKUserArea` (area definitions and caretaker/supervisor mapping)
- ✅ `HKWorker` (staff profiles, shift/worker types, reliever flag)
- ✅ `HKScheduleTemplate` (daily + Sunday-extra templates, photo requirements)
- ✅ `HKDailyRecord` (per-day generated task rows with completion/photo/note)
- ✅ `HKAttendanceRecord` (half-wise attendance with submission lock)
- ✅ `HKRelieverSubstitution` (absent-worker replacement tracking)
- ✅ `HKSundayIncharge` (Saturday assignment for Sunday coverage)
- ✅ `HKExtraWork` (ad-hoc task logging)
- ✅ `HKAreaStock` and `HKStockRequest` (housekeeping stock visibility + requests)
- ✅ `HKAlert` (priority alerts with optional area targeting and expiry)

### HTMX Mobile Workflows (`/housekeeping/`)
- ✅ Login/logout for housekeeping-enabled roles (`admin`, `manager`, `supervisor`, `caretaker`)
- ✅ Dashboard with area selector + grouped tasks + completion %
- ✅ **Common Area dashboard mode** (custom tab labels/headings)
- ✅ Mark task done/skipped with optional proof data
- ✅ Extra work logging (with optional photo)
- ✅ Weekly schedule view (Sunday extras only on Sunday)
- ✅ Attendance marking by half (`first`/`second`) + submit-half lock
- ✅ Reliever assignment flow for absent workers (HTMX partial refresh)
- ✅ Sunday incharge assignment flow
- ✅ Area stock view and stock request submission
- ✅ Profile page with password change support
- ✅ Alerts management view

### JSON API Coverage (`/api/housekeeping/`)
- ✅ Areas list
- ✅ Workers list (optional `?area=<id>`)
- ✅ Daily records list (optional `date` + `area`, defaults date to today)
- ✅ Schedule templates list (optional `?area=<id>`)
- ✅ Attendance summary by area/date
- ✅ Stock requests list
- ✅ Stock request status update (restricted roles)
- ✅ Active alerts list
- ✅ Dashboard summary metrics

---

## Role-wise API Access Map

Base path: `/api/housekeeping/`

| API Endpoint | Method | Admin | Manager | Inventory Manager | Supervisor/Caretaker | Notes |
|---|---|---|---|---|---|---|
| `/areas/` | GET | ✅ | ✅ | ✅ | ✅ | Active areas |
| `/workers/` | GET | ✅ | ✅ | ✅ | ✅ | Optional `?area=<id>` filter |
| `/daily-records/` | GET | ✅ | ✅ | ✅ | ✅ | Optional `date` and `area` filters |
| `/schedule-templates/` | GET | ✅ | ✅ | ✅ | ✅ | Active templates only |
| `/attendance-summary/` | GET | ✅ | ✅ | ✅ | ✅ | Area-wise present/absent summary |
| `/stock-requests/` | GET | ✅ | ✅ | ✅ | ✅ | Latest 50 requests |
| `/stock-requests/<id>/status/` | PATCH/PUT | ✅ | ✅ | ✅ | ❌ | Allowed: `admin`, `manager`, `inventory_manager` |
| `/alerts/` | GET | ✅ | ✅ | ✅ | ✅ | Active alerts |
| `/dashboard-summary/` | GET | ✅ | ✅ | ✅ | ✅ | Daily KPI counts |

---

## HTMX Route Coverage

Base path: `/housekeeping/`

- `/login/`
- `/logout/`
- `/dashboard/`
- `/task/<record_id>/mark/`
- `/extra-work/`
- `/schedule/`
- `/attendance/`
- `/attendance/sunday-incharge/`
- `/attendance/assign-reliever/`
- `/stock/`
- `/stock/request/`
- `/profile/`
- `/alerts/`

---

## Seed / Setup Helpers

- `python manage.py seed_housekeeping`
- `python manage.py seed_all_data`

---

## Known Gaps / Next Enhancements

1. Add create/update/delete APIs for areas, workers, and schedule templates (current JSON APIs are mostly list/status focused).
2. Add role-default filtering in APIs (e.g., caretaker sees only assigned areas by default).
3. Expose stock request creation/status history in JSON APIs for full API parity.
4. Add trend analytics APIs for attendance, completion, and consumption over time.
