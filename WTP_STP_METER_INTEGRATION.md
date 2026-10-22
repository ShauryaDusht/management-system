# WTP / STP Meter Readings Module - Campus Sanchalika Integration

The standalone water treatment and sewage meter readings module from `D:\wtp-stp-meter-app updated` has been fully integrated into the main **IITGN Campus Management System** (`d:\iitgn\management-system`).

---

## Architecture Overview

In accordance with the main project's architecture, the WTP / STP meter app is structured into two tiers:

1. **Django Backend (`apps.wtp_stp`)**:
   - **Database Models**:
     - `WtpReading`: Shift readings per date, shift, and station (`wtp`, `stp`, `wsc3`, `jm`), storing raw & computed meter values, operator name, verification status, and supervisor comments.
     - `BlockMeter`: Master catalog of all 84 campus block meters (hostels, residences, academic blocks, STP irrigation).
     - `BlockReading`: Monthly cumulative consumption documents per month (e.g. `2026-10`), keyed by meter serial number (`m1` to `m84`).
     - `StationMeter`: Dynamic custom station meters configured by administrators (with conversion coefficients and units).
     - `SupervisorLog`: Shift handover notes, operational checklist (`wtpChecked`, `stpChecked`, `chlorineChecked`, `jmTanksChecked`), and overall shift status (`Normal`, `Attention Needed`, `Critical`).
   - **RESTful APIs**:
     - Located at `/api/wtp/` (e.g. `/api/wtp/readings`, `/api/wtp/blocks/meters`, `/api/wtp/blocks/<month>`, `/api/wtp/station-meters`, `/api/wtp/supervisor/logs`, `/api/wtp/supervisor/overview`, `/api/wtp/summary`, `/api/wtp/health`).
   - **Staff Mobile PWA Portal**:
     - Dedicated server-rendered responsive mobile portal for on-duty operators and shift engineers at `/wtp/dashboard/`, `/wtp/entry/<station>/`, `/wtp/blocks/`, and `/wtp/history/`.
   - **User Roles & Redirection**:
     - `wtp_operator` and `wtp_supervisor` roles added to `apps.users.models.User`. Login via `/portal/login/` automatically redirects WTP staff to their mobile dashboard.

2. **React Admin SPA (`frontend-admin`)**:
   - Located at `frontend-admin/src/modules/wtp/` and `frontend-admin/src/pages/wtp/WtpPage.jsx`.
   - Accessible at `http://localhost:5173/admin/wtp`.
   - **Role-Based Tab Access**:
     - **Plant Operator (`isOperator`)**: Strictly focused on **Operator Log Entry** (`enter` tab with Station & Shift Readings + Monthly 84 Block Meters). Reports and verification are hidden.
     - **Shift Engineer (`isSupervisor`)**: Has access to **Tank Monitoring & Verification**, **Meter Readings**, **Jalmandapam Tanks**, **Chlorination & Alum**, and **Block Meters**.
     - **Administrator (`isAdmin`)**: Has access to all reports & configuration: **Meter Readings**, **Jalmandapam Tanks**, **Chlorination & Alum**, **Block Meters**, and **Add / Manage Meters**.
   - Navigation: Dedicated `WTP / STP Meters` link with a water droplet icon in the sidebar and an operational metric card on the admin overview dashboard.

---

## Default Login Credentials
All users can log in using either their **Username** or their **10-Digit Mobile Number** with password `IITGN@2025`.

| Role | Staff Name | Username / Mobile | Password | Portal / Default Redirect Target |
|---|---|---|---|---|
| **Executive Engineer (Combined Substation & WTP/STP)** | Pritesh Kumar Mundra | `pritesh.mundra` / `9462010595` | `IITGN@2025` | `http://localhost:8000/substation/dashboard/` & Admin SPA |
| **WTP-STP Supervisor** | Vikash Kumar Yadav | `vikash.yadav` / `9636041755` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` & Admin SPA |
| **WTP Operator** | Alpesh | `alpesh.wtp` / `9016763191` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Mahendra | `mahendra.wtp` / `7046115679` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Vijay Vaghela | `vijay.vaghela` / `9924825383` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Pankaj Baranda | `pankaj.baranda` / `9687523328` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Hardik | `hardik.wtp` / `7203834760` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Prakash | `prakash.wtp` / `9737730892` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Jaspal | `jaspal.wtp` / `7698767806` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Kamlesh | `kamlesh.wtp` / `9879569273` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Ishwar | `ishwar.wtp` / `9723863251` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **WTP Operator** | Pravin | `pravin.wtp` / `7874852060` | `IITGN@2025` | `http://localhost:8000/wtp/dashboard/` |
| **Super Admin** | Super Admin | `super.admin` / `admin` | `IITGN@2025` | `http://localhost:5173/admin/wtp` |

---

## Key URLs

- **Staff Portal Login**: `http://localhost:8000/portal/login/`
- **Mobile WTP Dashboard**: `http://localhost:8000/wtp/dashboard/`
- **Mobile Shift Log Entry**: `http://localhost:8000/wtp/entry/wtp/`
- **Mobile Monthly Block Meters**: `http://localhost:8000/wtp/blocks/`
- **Mobile Log History**: `http://localhost:8000/wtp/history/`
- **Admin SPA**: `http://localhost:5173/admin/wtp`
- **Django Admin**: `http://localhost:8000/manage/iitgn-staff/`

---

## Seed Data & Fixtures

The initial fixtures from the original Excel logs have been seeded into the SQLite / PostgreSQL database:
- **84 Block Meters**: Pre-populated from `fixtures/blocks.json`.
- **Historical Monthly Readings**: March through August 2026 pre-populated from `fixtures/sample-block-readings.json`.
- **Station Readings**: 84 baseline readings across all 4 stations (WTP, STP, WSC-III, Jalmandapam) for shifts 1, 2, and 3.

---

## Automatic 10,000 CUM Meter Rollover (WSC & STP)

Flow meters at **WSC (Water Supply Centers: WSC-I, WSC-II, WSC-III)** and **STP (Sewage Treatment Plant)** feature 4-digit cumulative dials that reset back to `0` after reaching up to `10,000 CUM`.

The system automatically detects when a meter rolls over from near 10,000 to 0 and computes accurate consumption:

$$\text{Actual Consumption} = (10,000 - \text{Previous Reading}) + \text{Current Reading}$$

- **Strict Trigger Condition**: Sirf tab change hoga jab reading 10,000 ke baad `0` par roll over ho (`previous <= 10,000` aur `current < previous`).
- **Readings > 10,000 CUM**: Agar reading 10,000 se zyada ho (jaise WTP bulk treatment plant meters `c` aur `f` jo 100,000+ par chalte hain ya koi reading > 10,000 ho), to **koi rollover change NAHI hoga**.
- **Supervisor UI Indicator**: Rollover events are flagged with a `🔄 10k` badge on the consumption matrix and live entry hint in the operator form (`10,000 CUM WSC / STP Rollover Detected`).

