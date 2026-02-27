# Inventory Management System

This document covers:
1. Inventory module functionalities
2. API endpoints relevant to inventory workflows
3. Role-based actions for **Admin**, **Manager**, and **Supervisor**

## Roles

| Role | Purpose |
|---|---|
| Admin | System-level control: manage users, categories, items, stock adjustments, analytics, and inventory visibility. |
| Manager | Operational control: review/approve/reject requests, issue inventory, record returns/finalization. |
| Supervisor | Requester role: create and track item requests and view their own issue records. |

## Role-based Functionalities

| Functionality | Admin | Manager | Supervisor |
|---|:---:|:---:|:---:|
| Login / get profile (`/api/auth/login`, `/api/auth/me`) | ✅ | ✅ | ✅ |
| Create / manage users | ✅ | ❌ | ❌ |
| View categories | ✅ | ✅ | ✅ |
| Create / edit / delete categories | ✅ | ❌ | ❌ |
| View items and filter/search inventory | ✅ | ✅ | ✅ |
| Create / edit / delete items | ✅ | ❌ | ❌ |
| View low-stock items endpoint | ✅ | ❌ | ❌ |
| View item history timeline | ✅ | ❌ | ❌ |
| Add stock entries / replenishment | ✅ | ❌ | ❌ |
| Direct stock adjust (increase/decrease) | ✅ | ❌ | ❌ |
| Create inventory request | ❌ | ❌ | ✅ |
| View all requests | ✅ | ✅ | ❌ (only own requests) |
| Review request (approve/reject) | ❌ | ✅ | ❌ |
| Approve/reject via viewset API actions | ✅ | ✅ | ❌ |
| Mark request urgent | ✅ | ✅ | ✅ |
| Issue approved request | ❌ | ✅ | ❌ |
| List issued records | ✅ | ✅ | ✅ (only own issued records) |
| Record asset return | ❌ | ✅ | ❌ |
| Finalize consumable usage | ❌ | ✅ | ❌ |
| Inventory dashboard summary | ✅ | ✅ | ✅ |
| User activity endpoint | ✅ | ❌ | ❌ |

> `✅` means role is authorized to perform the action.

---

## API Endpoints

Base URL: `http://localhost:8000/api`

### 1) Authentication & User APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/login/` | Public | Login and get JWT tokens |
| POST | `/auth/logout/` | Authenticated | Logout (token blacklist flow) |
| POST | `/auth/token/refresh/` | Authenticated (refresh token) | Get new access token |
| GET | `/auth/me/` | Authenticated | Current user profile |
| POST | `/auth/change-password/` | Authenticated | Change current user's password |
| GET/POST | `/auth/users/` | Admin | List/create users |
| GET/PATCH/DELETE | `/auth/users/<id>/` | Admin | Manage specific user |

### 2) Inventory Core APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET/POST | `/inventory/categories/` | GET: All authenticated, POST: Admin | List/create categories |
| GET/PATCH/DELETE | `/inventory/categories/<id>/` | Admin | Category details/update/delete |
| GET/POST | `/inventory/items/` | GET: All authenticated, POST: Admin | List/create items |
| GET | `/inventory/items/low-stock/` | Admin | List low stock items |
| GET/PATCH/DELETE | `/inventory/items/<id>/` | GET: Authenticated, write: Admin | Item details/update/delete |
| GET | `/inventory/items/<id>/history/` | Admin | Item movement history |
| GET | `/inventory/items/<id>/stock-entries/` | Admin | Stock entry logs for item |
| GET/POST | `/inventory/stock-entries/` | GET: Authenticated, POST: Admin | Replenishment records |
| GET | `/inventory/dashboard/` | Authenticated | Dashboard summary |
| GET | `/inventory/activity/users/<user_id>/` | Admin | Per-user inventory activity |

### 3) Request & Issue Workflow APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET/POST | `/inventory/requests/` | GET: Authenticated (scoped), POST: Supervisor | List/create item requests |
| GET | `/inventory/requests/<id>/` | Authenticated (scoped) | Request details |
| POST | `/inventory/requests/<id>/review/` | Manager | Approve/reject request |
| POST | `/inventory/requests/<id>/issue/` | Manager | Issue stock for approved request |
| GET | `/inventory/issues/` | Authenticated (scoped) | List issue records |
| POST | `/inventory/issues/<id>/return/` | Manager | Record return for assets |
| POST | `/inventory/issues/<id>/finalize/` | Manager | Finalize consumable usage |

### 4) ViewSet-style Inventory APIs (`/inventory/api/...`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET/POST | `/inventory/api/items/` | GET: Authenticated, POST: Admin | CRUD-style item list/create |
| GET/POST | `/inventory/api/categories/` | GET: Authenticated, POST: Admin | CRUD-style category list/create |
| GET/POST | `/inventory/api/requests/` | Authenticated (scoped) | CRUD-style request list/create |
| PUT/PATCH/DELETE | `/inventory/api/items/<id>/` | Admin | Update/delete item |
| PUT/PATCH/DELETE | `/inventory/api/categories/<id>/` | Admin | Update/delete category |
| POST | `/inventory/api/items/<id>/adjust-stock/` | Admin | Increase/decrease stock directly |
| GET | `/inventory/api/stats/` | Authenticated | Inventory statistics |
| POST | `/inventory/api/requests/<id>/approve/` | Admin/Manager | Approve pending request |
| POST | `/inventory/api/requests/<id>/reject/` | Admin/Manager | Reject pending request |
| POST | `/inventory/api/requests/<id>/mark-urgent/` | Authenticated | Mark/unmark urgent request |

---

## Suggested Usage Flow

1. Admin creates categories/items and keeps stock updated.
2. Supervisor creates item requests for operations.
3. Manager reviews requests (approve/reject).
4. Manager issues approved quantities.
5. For assets, manager records returns; for consumables, manager finalizes usage.
6. Admin tracks low stock, history, and user activity.
