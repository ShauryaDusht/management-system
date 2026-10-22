# Substation Log Module - Campus Sanchalika Integration

The standalone substation log module from `D:\substation-log` has been integrated into the main **IITGN Campus Management System** (`d:\iitgn\management-system`).

---

## Architecture Overview

In accordance with the main project's architecture, the Substation Log is structured into two tiers:

1. **Django Backend (`apps.substation`)**:
   - **Database Models**: `SubstationSheet`, `SubstationReading`, `SubstationConfigDoc` stored in the central SQLite / PostgreSQL database.
   - **Restful APIs**: Located at `/api/substation/` for querying readings, sheets, and health summaries.
   - **Staff Mobile PWA Portal**: Server-rendered responsive portal for on-duty electrical operators and supervisors located at `/substation/dashboard/`, `/substation/entry/<sheet_id>/`, `/substation/flash/`, and `/substation/history/`.
   - **User Roles & Redirection**: `electrical_operator` and `electrical_supervisor` roles added to `apps.users.models.User`. Login via `/portal/login/` automatically redirects electrical staff to their mobile dashboard.

2. **React Admin SPA (`frontend-admin`)**:
   - Located at `frontend-admin/src/modules/substation/`.
   - Accessible to Campus Administrators at `http://localhost:5173/admin/substation`.
   - Features: Shift Snapshot Entry, Supervisor Review & Approvals, Historical Analytics & CSV Export, R-01 Flash Power Demand, and Substation Layout Configuration.
   - Navigation item in the left sidebar under Operations with a dedicated metric card on the admin overview dashboard.

---

## Default Login Credentials

| Role | Staff Name | Username / Mobile | Password | Portal / Default Redirect Target |
|---|---|---|---|---|
| **Executive Engineer (Combined Substation & WTP/STP)** | Pritesh Kumar Mundra | `pritesh.mundra` / `9462010595` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` & Admin SPA |
| **Substation Supervisor** | Kaushik Kumar P. Khetani | `kaushik.khetani` / `9998991506` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Katara Maheshbhai Bachubhai | `mahesh.katara` / `9978318871` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Thakor Dilipkumar Gabhaji | `dilip.thakor` / `9723236037` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Jaydipkumar Bansilal Gajjar | `jaydip.gajjar` / `8905166563` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Priteshkumar Vinubhai Patel | `pritesh.patel` / `9904324188` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Patel Darshankumar Bharatbhai | `darshan.patel` / `9173563689` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Govindbhai Virjibhai Baranda | `govind.baranda` / `9537349472` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Substation Operator** | Rameshbhai Dantani | `ramesh.dantani` / `9714804681` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` |
| **Super Admin** | Super Admin | `super.admin` / `9727757096` | `IITGN@2025` | `http://localhost:5173/admin/substation` |

---

## Key URLs

- **Staff Portal Login**: `http://localhost:8000/portal/login/`
- **Mobile Substation Dashboard**: `http://localhost:8000/substation/dashboard/`
- **Mobile Log Entry**: `http://localhost:8000/substation/entry/`
- **R-01 Flash Report**: `http://localhost:8000/substation/flash/`
- **Log History**: `http://localhost:8000/substation/history/`
- **Admin SPA**: `http://localhost:5173/admin/substation`
- **Django Admin**: `http://localhost:8000/manage/iitgn-staff/`
