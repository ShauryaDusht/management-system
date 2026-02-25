#  Inventory Management System 

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
| Mobile Web (HTMX) | http://localhost:8000/inventory/mobile/ |
| API | http://localhost:8000/api/inventory/ |
| Django Admin | http://localhost:8000/admin/ |

## Stop
```bash
docker compose down
```

## Reset database
```bash
docker compose down -v
```

# API Reference

Base URL: `http://localhost:8000/api`

---

## Authentication

All endpoints except `/auth/login/` require a Bearer token in the header:

```
Authorization: Bearer <access_token>
```

Access tokens expire in **8 hours**. Refresh tokens last **7 days**.

---

## 1. Login

**POST** `/auth/login/`

No auth required.

**Request body:**
```json
{
  "username": "admin-shaurya",
  "password": "your_password"
}
```

**Response:**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin-shaurya",
    "email": "admin@example.com",
    "full_name": "Shaurya Admin",
    "role": "admin",
    "phone": ""
  }
}
```

**cURL example:**
```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin-shaurya", "password": "your_password"}'
```

---

## 2. Logout

**POST** `/auth/logout/`

Requires auth. Blacklists the refresh token.

**Request body:**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "detail": "Successfully logged out."
}
```

**cURL example:**
```bash
curl -X POST http://localhost:8000/api/auth/logout/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh": "<refresh_token>"}'
```

---

## 3. Refresh Access Token

**POST** `/auth/token/refresh/`

Use this when access token expires.

**Request body:**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 4. Get Current User

**GET** `/auth/me/`

Returns the logged-in user's info.

**cURL example:**
```bash
curl http://localhost:8000/api/auth/me/ \
  -H "Authorization: Bearer <access_token>"
```

**Response:**
```json
{
  "id": 1,
  "username": "admin-shaurya",
  "email": "",
  "first_name": "Shaurya",
  "last_name": "",
  "role": "admin",
  "phone": "",
  "is_active": true
}
```

---

## 5. User Management (Admin only)

### List all users
**GET** `/auth/users/`

```bash
curl http://localhost:8000/api/auth/users/ \
  -H "Authorization: Bearer <access_token>"
```

### Create a user
**POST** `/auth/users/`

```bash
curl -X POST http://localhost:8000/api/auth/users/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "supervisor1",
    "password": "Pass@1234",
    "first_name": "Ramesh",
    "last_name": "Kumar",
    "role": "supervisor",
    "phone": "9876543210",
    "email": "ramesh@example.com"
  }'
```

**Role values:** `admin` | `manager` | `supervisor`

### Update a user
**PATCH** `/auth/users/<id>/`

```bash
curl -X PATCH http://localhost:8000/api/auth/users/3/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "manager"}'
```

---

## 6. Categories (Admin only for create/edit)

### List categories
**GET** `/inventory/categories/`

```bash
curl http://localhost:8000/api/inventory/categories/ \
  -H "Authorization: Bearer <access_token>"
```

### Create a category
**POST** `/inventory/categories/`

```bash
curl -X POST http://localhost:8000/api/inventory/categories/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Cleaning Supplies", "description": "All cleaning consumables"}'
```

---

## 7. Inventory Items

### List all items
**GET** `/inventory/items/`

Optional query params:
- `?search=floor` — search by name
- `?type=asset` or `?type=consumable`
- `?category=2` — filter by category ID
- `?low_stock=true` — only items below threshold

```bash
curl "http://localhost:8000/api/inventory/items/?type=consumable&low_stock=true" \
  -H "Authorization: Bearer <access_token>"
```

### Create an item (Admin only)
**POST** `/inventory/items/`

```bash
curl -X POST http://localhost:8000/api/inventory/items/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Floor Cleaner",
    "category": 1,
    "item_type": "consumable",
    "unit": "litres",
    "total_quantity": 100,
    "threshold_quantity": 20,
    "unit_cost": 150.00,
    "description": "Used for mopping floors"
  }'
```

**item_type values:** `asset` | `consumable`

**unit values:** `pieces` | `litres` | `kg` | `metres` | `packets` | `bottles` | `boxes`

### Update an item (Admin only)
**PATCH** `/inventory/items/<id>/`

```bash
curl -X PATCH http://localhost:8000/api/inventory/items/5/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"threshold_quantity": 30}'
```

### Get items below threshold (Admin only)
**GET** `/inventory/items/low-stock/`

```bash
curl http://localhost:8000/api/inventory/items/low-stock/ \
  -H "Authorization: Bearer <access_token>"
```

---

## 8. Item Requests (Supervisor → Manager workflow)

### Supervisor: Create a request
**POST** `/inventory/requests/`

Only supervisors can create requests.

```bash
curl -X POST http://localhost:8000/api/inventory/requests/ \
  -H "Authorization: Bearer <supervisor_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "item": 5,
    "quantity_requested": 10,
    "purpose": "Cleaning the lobby and corridors on 3rd floor"
  }'
```

### List requests
**GET** `/inventory/requests/`

- Supervisors see only their own requests
- Managers and Admin see all requests

```bash
curl http://localhost:8000/api/inventory/requests/ \
  -H "Authorization: Bearer <access_token>"
```

Optional filter: `?status=pending` | `approved` | `rejected` | `issued`

---

## 9. Review a Request (Manager only)

**POST** `/inventory/requests/<id>/review/`

### Approve:
```bash
curl -X POST http://localhost:8000/api/inventory/requests/3/review/ \
  -H "Authorization: Bearer <manager_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'
```

### Reject:
```bash
curl -X POST http://localhost:8000/api/inventory/requests/3/review/ \
  -H "Authorization: Bearer <manager_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "reject",
    "rejection_reason": "Already issued last week, check storage room."
  }'
```

**action values:** `approve` | `reject`

---

## 10. Issue an Item (Manager only)

**POST** `/inventory/requests/<id>/issue/`

Only works on requests with status `approved`. Deducts from available_quantity automatically.

```bash
curl -X POST http://localhost:8000/api/inventory/requests/3/issue/ \
  -H "Authorization: Bearer <manager_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "issued_quantity": 10,
    "notes": "Issued from Store Room B"
  }'
```

For assets, you can also pass `"expected_return_date": "2026-03-15"`.

---

## 11. Issued Items History

**GET** `/inventory/issues/`

- Supervisors see their own issued items
- Managers and Admin see all

```bash
curl http://localhost:8000/api/inventory/issues/ \
  -H "Authorization: Bearer <access_token>"
```

---

## 12. Admin Dashboard Summary

**GET** `/inventory/dashboard/`

Admin only. Returns counts for the dashboard.

```bash
curl http://localhost:8000/api/inventory/dashboard/ \
  -H "Authorization: Bearer <admin_access_token>"
```

**Response:**
```json
{
  "total_items": 47,
  "low_stock_count": 5,
  "out_of_stock_count": 1,
  "pending_requests": 3
}
```

---

## Full Workflow Example

Here is the complete flow from login to issuing an item:

```bash
# Step 1: Supervisor logs in
SUPERVISOR_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "supervisor-shaurya", "password": "your_pass"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access'])")

# Step 2: Supervisor creates a request
curl -X POST http://localhost:8000/api/inventory/requests/ \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"item": 1, "quantity_requested": 5, "purpose": "Weekly floor cleaning"}'

# Step 3: Manager logs in
MANAGER_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "manager-shaurya", "password": "your_pass"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access'])")

# Step 4: Manager approves the request (id=1)
curl -X POST http://localhost:8000/api/inventory/requests/1/review/ \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'

# Step 5: Manager issues the item
curl -X POST http://localhost:8000/api/inventory/requests/1/issue/ \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"issued_quantity": 5}'
```

---

## Status Reference

| Status | Meaning |
|--------|---------|
| `pending` | Request submitted by supervisor, awaiting manager review |
| `approved` | Manager approved, not yet physically issued |
| `rejected` | Manager rejected with reason |
| `issued` | Item physically handed over, stock deducted |

| Stock Status | Meaning |
|-------------|---------|
| `in_stock` | Available quantity above threshold |
| `low_stock` | Available quantity below threshold |
| `out_of_stock` | Available quantity is 0 |

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Missing or expired token | Login again or refresh token |
| `403 Forbidden` | Wrong role for this endpoint | Use correct user role |
| `404 Not Found` | Wrong URL or ID doesn't exist | Check URL and ID |
| `400 Bad Request` | Missing required fields or validation failed | Check response body for details |
| `Insufficient stock` | Available qty less than requested | Reduce quantity or wait for restock |
