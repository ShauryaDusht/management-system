# HVAC Plant Daily Log Module - Campus Sanchalika Integration

The standalone HVAC plant daily log module from `C:\Users\sonir\Downloads\hvac-plant-log-mongodb` has been fully integrated into the main **IITGN Campus Management System** (`d:\iitgn\management-system`).

---

## Architecture Overview

In accordance with the main project architecture, the HVAC Plant Log is structured into two tiers:

1. **Django Backend (`apps.hvac`)**:
   - **Database Models**:
     - `HvacLog`: 24-hour continuous hourly readings per date and slot (`08:30` to `07:30`, indexed `0` to `23`), across Shifts 1, 2, and 3. Storing raw & derived telemetry for 7 chillers, primary/secondary/condenser pumps, cooling towers, MWh energy panels, water makeup meters, operator name, active setpoint °C, and real-time operational alerts.
     - `HvacSupervisorLog`: Shift remarks, status (`Normal`, `Attention Needed`, `Critical`), and physical verification checklist.
   - **RESTful APIs**:
     - Located at `/api/hvac/` (`/api/hvac/logs/`, `/api/hvac/overview/`, `/api/hvac/supervisor/`, `/api/hvac/health/`).
   - **Staff Mobile PWA Portal**:
     - Dedicated server-rendered responsive mobile portal for on-duty operators and shift engineers at `/hvac/dashboard/`, `/hvac/entry/`, `/hvac/flash/`, and `/hvac/history/`.
   - **User Roles & Redirection**:
     - `hvac_engineer`, `hvac_supervisor`, and `hvac_operator` roles added to `apps.users.models.User`. Login via `/portal/login/` automatically redirects HVAC staff to their mobile dashboard.

2. **React SPA & Engineer Portal (`frontend-admin`)**:
   - Located at `frontend-admin/src/modules/hvac/` and `frontend-admin/src/pages/hvac/HvacPage.jsx`.
   - Accessible at `http://localhost:5173/admin/hvac`.
   - **Tabs in HVAC Portal**:
     - ❄️ **Plant Status & Daily Log**: Real-time 7-chiller telemetry, status tiles, active alerts, SVG trend graph, daily energy and water reports.
     - ⚡ **Daily Flash Report (R-01)**: Continuous 24-hour log matrix across all parameters with signature blocks.
     - 📊 **Monthly Report**: Month-wide daily consumption matrix and chiller operating hours breakdown.
     - *(Note: Shift Operator Log Entry is dedicated exclusively to the Mobile PWA portal at `/hvac/entry/`)*.
   - **Single Unified Dropdown**: Equipped with the unified `ExportDropdown` supporting instant **Export to CSV** and **Export to PDF** on all reporting views.

---

## Active Staff & Login Credentials

All accounts can log in using either their **Username** or their **10-Digit Mobile Number** with password `IITGN@2025`.

### 1. HVAC Engineer

| Name | Role | Username | Mobile Number (Login ID) | Password | Portal Target |
|---|---|---|---|---|---|
| **Rajesh Kumar Mangwani** | HVAC Engineer | `rajesh.mangwani` | `9644945675` | `IITGN@2025` | Desktop `/admin/hvac` & Mobile `/hvac/dashboard/` |

### 2. HVAC Supervisors

| Name | Role | Username | Mobile Number (Login ID) | Password | Portal Target |
|---|---|---|---|---|---|
| **Kushal Patel** | HVAC Supervisor | `kushal.patel` | `7622059360` | `IITGN@2025` | Desktop `/admin/hvac` & Mobile `/hvac/dashboard/` |
| **Umesh Khetani** | HVAC Supervisor | `umesh.khetani` | `8485932077` | `IITGN@2025` | Desktop `/admin/hvac` & Mobile `/hvac/dashboard/` |

### 3. HVAC Plant Operators / Technicians

| S.No | Name | Role / Designation | Username | Mobile Number (Login ID) | Password | Portal Target |
|---|---|---|---|---|---|---|
| 1 | **Sunil Makwana** | Operator/Technician | `sunil.makwana` | `8347927646` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 2 | **Kuldeep Patel** | Operator/Technician | `kuldeep.patel` | `8980668066` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 3 | **Manoj Dantani** | Operator/Technician | `manoj.dantani` | `9724156013` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 4 | **Arun Bariya** | Operator/Technician | `arun.bariya` | `8155070543` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 5 | **Mitesh Sharma** | Operator/Technician | `mitesh.sharma` | `9909234092` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 6 | **Pankaj Chauhan** | Operator/Technician | `pankaj.chauhan` | `9898808661` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 7 | **Vishal Makwana** | Operator/Technician | `vishal.makwana` | `8141662948` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 8 | **Vipul Parmar** | Operator/Technician | `vipul.parmar` | `9510465497` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 9 | **Kiran Dabhi** | Operator/Technician | `kiran.dabhi` | `7041147485` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |
| 10 | **Maruf Shekh** | Operator/Technician | `maruf.shekh` | `7574008870` | `IITGN@2025` | Mobile `/hvac/entry/` & Desktop `/admin/hvac` |

*(Note: Plant Executive Engineer **Pritesh Kumar Mundra** (`9462010595`) and Super Admin (`super.admin`) also retain full managerial oversight across HVAC, Substation, and WTP/STP).*

---

## Key URLs

- **Staff Portal Login**: `http://localhost:8000/portal/login/`
- **Mobile HVAC Dashboard**: `http://localhost:8000/hvac/dashboard/`
- **Mobile Hourly Log Entry**: `http://localhost:8000/hvac/entry/`
- **Mobile R-01 Flash Sheet**: `http://localhost:8000/hvac/flash/`
- **Mobile Log History**: `http://localhost:8000/hvac/history/`
- **Admin / Engineer SPA**: `http://localhost:5173/admin/hvac`
- **Django Admin**: `http://localhost:8000/manage/iitgn-staff/`

---

## Seed Data & Fixtures

The initial fixtures from the reference project have been seeded into the SQLite database:
- **144 Hourly Slot Readings**: Pre-populated from `fixtures/seed/s00.json` to `s23.json` across:
  - Historical Excel dataset: September 1, 2, and 3, 2024.
  - Active campus operations: October 17, 18, and 19, 2026.
- **7 Campus Chillers Telemetry**: Trane 1 (305 TR), Trane 2 (305 TR), Trane 3 (305 TR), Trane 4 (305 TR), Carrier 5 (600 TR), Daikin 6 (605 TR), Daikin 7 (605 TR).
- **HVAC Electrical Panels**: Panel 1 & Panel 2 (MWh, Amp, PF).
- **Water Makeup Meters**: Water Meter 1 & 2 (kL).
