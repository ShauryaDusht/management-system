# Inventory Module — Phases, Checklist & Role-wise API

This document is the **single source of truth** for delivery progress in the inventory domain.
Use it during daily standups/handoffs so multiple developers do not repeat the same work.

---

## Status Legend

- ✅ **Done** — implemented and wired in backend/frontend.
- 🟡 **Partial** — implemented in some form, but not matching the phase spec fully.
- ⬜ **Not Started** — not implemented yet.

---

## Coordination Checklist System (How to Use)

When you start any task:
1. Find the item below.
2. Add your name/date in **Owner / Notes**.
3. Move status as you complete work.
4. Link PR/commit in notes.

---

## Phase Progress Snapshot

## Phase 1 — Core Inventory Workflow (MVP)

### Backend
- ✅ Custom User model (Admin, Manager, Supervisor)
- ✅ JWT auth (login, refresh, me, logout)
- ✅ Role-based permissions
- ✅ Models: Category, Item, ItemRequest, ItemIssue
- ✅ Workflow: supervisor request → manager approve/reject → manager issue
- ✅ Available quantity auto-deduct on issue
- ✅ Dashboard API (total items, low stock, basic stats)

### Frontend
- ✅ Login page
- ✅ Protected routes (role-based)
- ✅ Admin dashboard with low-stock highlight
- ✅ Items page (CRUD + stock adjust)
- ✅ Requests page (manager/admin view)
- ✅ My Requests page (supervisor)
- ✅ Issues page
- ✅ Users management page
- ✅ Sidebar layout

**Phase 1:** ✅ **Done**

---

## Phase 2 — Returns, Tracking & Data Integrity

### Backend
- ✅ StockEntry model (replenishment logging)
- ✅ ReturnAsset API (returned quantity, condition, returned_at)
- ✅ Return flow adds stock back to available quantity
- ✅ FinalizeConsumable API (actual used + unused return)
- ✅ Item history endpoint
- ✅ User activity endpoint
- ✅ Stock entry endpoints
- ✅ Extended dashboard (unreturned assets, unfinalized consumables)

### Frontend
- ✅ Item History page (timeline)
- ✅ Stock Entries page
- ✅ User Activity page
- ✅ Issues page with Return + Finalize actions
- ✅ History button in Items
- ✅ Activity button in Users
- ✅ Supervisor sees My Issues (via role-filtered Issues page)

**Phase 2:** ✅ **Done**

---

## Phase 3 — Manual Reporting & Procurement

### Backend
- ✅ MonthlyReport model with snapshot + csv/pdf file fields (reports app)
- ✅ Manual report generation endpoint by month (`/api/reports/monthly/generate/`)
- ✅ Consumption logic per spec (consumable actual used + asset issued)
- ✅ Recommended order formula (consumption + 10% buffer, rounded up)
- ✅ Threshold-gap fallback when usage is zero
- ✅ CSV export endpoint (`/api/reports/monthly/<id>/csv/`)
- ✅ PDF export endpoint (`/api/reports/monthly/<id>/pdf/`)
- ✅ Report history persistence (monthly list/detail/delete)

### Frontend
- ✅ Admin month-based report generation UI (`/reports` monthly tab)
- ✅ Download CSV from backend-generated monthly report
- ✅ Download PDF from backend-generated monthly report
- ✅ View/download historical monthly reports
- ✅ Reports page supports inventory, requests, and monthly procurement history

**Phase 3:** ✅ **Done**

---

## Phase 4 — Analytics & UX Upgrade

### Admin Dashboard
- ⬜ 6-month trend line chart (for each consumable and asset)
- ⬜ Category-wise consumption pie chart
- ⬜ Total monthly consumption value
- ⬜ Most active supervisor

### Inventory UX
- ⬜ Visual stock bar per item
- 🟡 Color-coded threshold states (implemented as badges, no stock bar yet)

### Manager Dashboard
- 🟡 Pending requests count exists in dashboard API, but no dedicated manager dashboard UI
- ⬜ Weekly issued count
- ⬜ Unreturned assets summary
- ⬜ Quick action links

### Supervisor Dashboard
- ⬜ Active requests summary dashboard
- ⬜ Issued but unreturned items summary dashboard
- ⬜ Quick new request button in dedicated supervisor dashboard

**Phase 4 overall:** 🟡 **Partially Started**

---

## Role-wise API Access Map

Base path: `/api/inventory/`

| API Endpoint | Method | Admin | Manager | Supervisor | Notes |
|---|---|---|---|---|---|
| `/items/` | GET | ✅ | ✅ | ✅ | List items |
| `/items/` | POST | ✅ | ❌ | ❌ | Create item |
| `/items/<id>/` | GET | ✅ | ✅ | ✅ | Item details |
| `/items/<id>/` | PUT/PATCH/DELETE | ✅ | ❌ | ❌ | Update/delete item |
| `/items/low-stock/` | GET | ✅ | ❌ | ❌ | Low-stock list |
| `/items/<id>/history/` | GET | ✅ | ❌ | ❌ | Item timeline history |
| `/items/<id>/stock-entries/` | GET | ✅ | ❌ | ❌ | Item-specific replenishment log |
| `/stock-entries/` | GET | ✅ | ❌ | ❌ | Full stock entry list |
| `/stock-entries/` | POST | ✅ | ❌ | ❌ | Add replenishment entry |
| `/requests/` | GET | ✅ | ✅ | ✅ | Supervisor sees own only |
| `/requests/` | POST | ❌ | ❌ | ✅ | Create item request |
| `/requests/<id>/` | GET | ✅ | ✅ | ✅ | Supervisor sees own only |
| `/requests/<id>/review/` | POST | ❌ | ✅ | ❌ | Approve/reject pending request |
| `/requests/<id>/issue/` | POST | ❌ | ✅ | ❌ | Issue approved request |
| `/issues/` | GET | ✅ | ✅ | ✅ | Supervisor sees own issues only |
| `/issues/<id>/return/` | POST | ❌ | ✅ | ❌ | Asset return + stock add-back |
| `/issues/<id>/finalize/` | POST | ❌ | ❌ | ✅ | Consumable finalization + unused add-back |
| `/activity/users/<id>/` | GET | ✅ | ❌ | ❌ | User request/review activity |
| `/dashboard/` | GET | ✅ | ❌ | ❌ | Dashboard summary |

---

## Authentication APIs (User Module)

Base path: `/api/auth/`

| API Endpoint | Method | Admin | Manager | Supervisor | Notes |
|---|---|---|---|---|---|
| `/login/` | POST | ✅ | ✅ | ✅ | Obtain JWT access + refresh |
| `/logout/` | POST | ✅ | ✅ | ✅ | Blacklist refresh token |
| `/token/refresh/` | POST | ✅ | ✅ | ✅ | Refresh access token |
| `/me/` | GET | ✅ | ✅ | ✅ | Current user details |
| `/change-password/` | POST | ✅ | ✅ | ✅ | Self-service password change |
| `/users/` | GET | ✅ | ❌ | ❌ | List users (admin only) |
| `/users/` | POST | ✅ | ❌ | ❌ | Create user (admin only) |
| `/users/<id>/` | GET/PUT/PATCH/DELETE | ✅ | ❌ | ❌ | Manage user (admin only) |

---

## Frontend Route Coverage (Current)

- `/login`
- `/dashboard` (admin)
- `/items`
- `/items/:id/history` (admin)
- `/requests`
- `/my-requests` (supervisor)
- `/issues`
- `/stock-entries` (admin)
- `/users` (admin)
- `/users/:id/activity` (admin)
- `/reports` (inventory + requests + monthly procurement history)

---

## TODO

1. Build **Phase 4 analytics APIs** (trend and category consumption datasets).
2. Wire **admin dashboard charts** for trends + category pie.
3. Add **manager dashboard summary widgets** (pending, weekly issued, unreturned, quick actions).
4. Add **supervisor dashboard** (active requests, unreturned issued items, quick request action).
