# Updated Implementation Prompt - Import Latest Housekeeping Staff Excel and Sync Portals

You are working in the `d:\management-system` project.

Implement an idempotent import process for the latest Housekeeping staff Excel file:

```txt
C:\Users\Sarthak\Downloads\Hk Staff (2).xlsx
```

The importer must read the real workbook data described below and synchronize housekeeping workers, area assignments, supervisor links, attendance visibility, assignment screens, and admin reports without deleting or disabling any existing records.

## Excel Workbook Details

Workbook profile:

- Sheet name: `all name  `
- Total XML rows: `984`
- Real non-empty staff rows: `69`
- Header row: `Cod`, `NAME`, `CARETOGERY`, `Hostel`, `Name of Supervisor`, `Work`
- Categories:
  - `H K Staff`: 60 rows
  - `Reliver`: 9 rows
- Duplicate pay codes found in this workbook: `0`
- Blank pay-code rows: `0`
- Blank name rows: `0`

Column mapping:

- `Cod` -> `HKWorker.pay_code`
- `NAME` -> `HKWorker.name`
- `CARETOGERY` -> worker category; `Reliver` means `HKWorker.is_reliever=True` and `worker_type='reliever'`
- `Hostel` -> `HKWorker.area`
- `Name of Supervisor` -> `HKWorker.supervisor`
- `Work` -> work allocation text; use this to infer `worker_type` when possible, and preserve/report it for audit

## Project Context

Relevant models:

- `backend/apps/housekeeping/models.py`
  - `HKWorker`
  - `HKArea`
  - `HKUserArea`
  - `HKAttendanceRecord`
  - `HKDailyRecord`
  - `HKTaskWorkerAssignment`
  - `HKWorkerSelectionRequest`
- `backend/apps/users/models.py`
  - `User`
  - Roles include `supervisor` and `caretaker`

Important distinction:

- Ground housekeeping staff are stored as `HKWorker`.
- Portal login users are stored as `User`.
- `Admin -> Manage Users` manages `User` records, not ground `HKWorker` records.
- Imported ground workers must be created/updated as `HKWorker`.
- Do not create login users for the 69 ground staff rows.
- Only create/update `User` records if a future sheet row clearly represents a supervisor/caretaker/login staff member.

## Exact Area / Hostel Mapping From Excel

Use these workbook area aliases when resolving `HKArea`.

```txt
Aibaan -> Aibaan
Beauki -> Beuaki
Block-A, JRHA -> Jeet Hostel Block A
Block-B, JRHA -> Jeet Hostel Block B
Block-C, JRHA -> Jeet Hostel Block C
Block-D, JRHA -> Jeet Hostel Block D
Chimair -> Chimair
Common Area & Mess -> Hostel Common Area
Duven -> Duven
Emiet -> Emiet
Firpeal -> Firpeal
Griwiksh -> Griwiksh
Hiqom -> Hiqom
Ijokha -> Ijokha
Jurqia -> Jurqia
Kyzeel -> Kyzeel
Lekhaag -> Lekhaag
```

If an alias target does not exist in `HKArea`, create it only if it is clearly a real area. For the mappings above, prefer existing project names exactly as shown on the right.

## Supervisor Mapping From Excel

Resolve supervisor labels to existing `User` records where possible:

```txt
Ms. Priyanka -> priyanka.parmar
Ms. Anita Vaghela -> anita.vaghela
Ms. Manisha Thapa -> manisha.thapa
Mr. Vishwajeet Mishra -> vishwajeet.mishra
Mr. Pankaj A Bihola -> pankaj.bihola
Mr. Anilkumar Solanki -> anil.solanki
Mr. Nikulsinh Bihola -> nikul.bihola
Ms. Rushita chauhan -> rhushita.chavda
Mr. Jaimin Parmar -> jaimin.parmar
Mr. Ramsingh -> ramprakash.parmar
```

If any mapped username does not exist, do not fail the import. Log it under `Supervisor Not Found` and leave existing worker supervisor unchanged.

## Exact Staff Rows From Excel

Use these 69 rows as the source data. Normalize names and pay codes before matching, but keep enough original row context in logs.

| Excel Row | Pay Code | Name | Category | Excel Hostel | Target Area | Supervisor Username | Work Allocation |
|---:|---|---|---|---|---|---|---|
| 2 | 357 | Reeta ben | H K Staff | Aibaan | Aibaan | priyanka.parmar | 4 Floor, Common Room, 1 Staircase, Dusting |
| 3 | 219 | Sangeeta ben | H K Staff | Aibaan | Aibaan | priyanka.parmar | Washroom: 8 washrooms cleaning, washroom dusting, one staircase cleaning |
| 4 | 419 | shilpa ben | H K Staff | Aibaan | Aibaan | priyanka.parmar | 30 room cleaning, common dusting, pantry small dustbin regular cleaning, staircase cleaning |
| 5 | 98 | kailashben m | H K Staff | Beauki | Beuaki | anita.vaghela | Room: 18 room cleaning, staircase cleaning, common room cleaning, common area cleaning |
| 6 | 76 | Meena ben | H K Staff | Beauki | Beuaki | anita.vaghela | Washroom: 12 washroom cleaning, pantry cleaning |
| 7 | 415 | sonal ben | H K Staff | Beauki | Beuaki | anita.vaghela | Floor: 4 floor cleaning, dusting |
| 8 | 356 | manisha ben | H K Staff | Beauki | Beuaki | anita.vaghela | |
| 9 | 416 | Rajesh bhai parmar | H K Staff | Block-A, JRHA | Jeet Hostel Block A | manisha.thapa | 30 room cleaning, common dusting, flat common small dustbin regular cleaning, staircase cleaning |
| 10 | 417 | Rathod Rahul | H K Staff | Block-A, JRHA | Jeet Hostel Block A | manisha.thapa | 24 washroom deep cleaning, staircase cleaning, terrace cleaning every Sunday, common lift cleaning |
| 11 | 450 | Darshan Brahmaniya | H K Staff | Block-A, JRHA | Jeet Hostel Block A | manisha.thapa | Ground floor common road cleaning, dustbin, 8 pantry cleaning, staircase cleaning, basement cleaning every Sunday |
| 12 | 129 | Manisha ben k Vaghela | H K Staff | Block-B, JRHA | Jeet Hostel Block B | manisha.thapa | 30 room cleaning, common dusting, flat common small dustbin regular cleaning, staircase cleaning |
| 13 | 134 | Sugna ben J Vaghela | H K Staff | Block-B, JRHA | Jeet Hostel Block B | manisha.thapa | 24 washroom deep cleaning, staircase cleaning, terrace cleaning every Sunday, common lift cleaning |
| 14 | 150 | Leela Ben Dipak Kumar Parmar | H K Staff | Block-B, JRHA | Jeet Hostel Block B | manisha.thapa | Ground floor common road cleaning, dustbin, 8 pantry cleaning, staircase cleaning, basement cleaning every Sunday |
| 15 | 454 | Suresh bhai | H K Staff | Block-C, JRHA | Jeet Hostel Block C | manisha.thapa | Ground floor common road cleaning, dustbin, 8 pantry cleaning, staircase cleaning, basement cleaning every Sunday |
| 16 | 456 | Himmat bhai | H K Staff | Block-C, JRHA | Jeet Hostel Block C | manisha.thapa | 30 room cleaning, common dusting, flat common small dustbin regular cleaning, staircase cleaning |
| 17 | 77 | Hashmukh bhai | Reliver | Block-C, JRHA | Jeet Hostel Block C | manisha.thapa | 24 washroom deep cleaning, staircase cleaning, terrace cleaning every Sunday, common lift cleaning |
| 18 | 457 | Bhavika ben solnki | H K Staff | Block-D, JRHA | Jeet Hostel Block D | manisha.thapa | 30 room cleaning, common dusting, flat common small dustbin regular cleaning, staircase cleaning |
| 19 | 458 | Mehariya Hetal ben Ashok bhai | H K Staff | Block-D, JRHA | Jeet Hostel Block D | manisha.thapa | 24 washroom deep cleaning, staircase cleaning, terrace cleaning every Sunday, common lift cleaning |
| 20 | 459 | Urvashi ben Nayan bhai Vaghela | H K Staff | Block-D, JRHA | Jeet Hostel Block D | manisha.thapa | Ground floor common road cleaning, dustbin, 8 pantry cleaning, staircase cleaning, basement cleaning every Sunday |
| 21 | 332 | bhanu ben | H K Staff | Chimair | Chimair | anita.vaghela | |
| 22 | 249 | Champa ben | H K Staff | Chimair | Chimair | anita.vaghela | |
| 23 | 418 | Deepika ben | H K Staff | Chimair | Chimair | anita.vaghela | |
| 24 | 233 | Surya ben | H K Staff | Chimair | Chimair | anita.vaghela | |
| 25 | 80 | Yogesh Vaghela | H K Staff | Common Area & Mess | Hostel Common Area | vishwajeet.mishra | Hostel office, all common washrooms, mini library, student lounge, old mess second floor area and washroom, other work |
| 26 | 240 | Vinayak Solanki | H K Staff | Common Area & Mess | Hostel Common Area | vishwajeet.mishra | New mess common area front/back cleaning, Hiqom front/back, New PC perimeter, Ijokha/Lekhaag/Firpeal/Emiet backside route cleaning, other work |
| 27 | 100 | Ketan Gujjar | H K Staff | Common Area & Mess | Hostel Common Area | vishwajeet.mishra | Aibaan, Beauki, Chimair, old mess, Duven, Kyzeel, Jurqia backside; Lekhaag/Kyzeel/Jurqia/Ijokha front common cleaning, other work |
| 28 | 471 | Krunal Parmar | Reliver | Common Area & Mess | Hostel Common Area | vishwajeet.mishra | All housekeeping common staff, multiple staff area changes |
| 29 | 472 | Suresh Solanki | H K Staff | Common Area & Mess | Hostel Common Area | vishwajeet.mishra | New/old mess terrace weekly, new mess second floor hall/washroom, bridge, conference hall on different days, boys hostel washroom touch-up 6pm-10pm |
| 30 | 542 | Anil Thakur | H K Staff | Common Area & Mess | Hostel Common Area | vishwajeet.mishra | New mess to old mess corridor cleaning and all old hostel common area cleaning |
| 31 | 115 | Jignesh | H K Staff | Duven | Duven | pankaj.bihola | 12 washrooms, 1 staircase, common cleaning |
| 32 | 260 | Karan | H K Staff | Duven | Duven | pankaj.bihola | 4 pantry, 30 rooms, 1 staircase, dustbin cleaning, terrace cleaning every Sunday |
| 33 | 109 | Sailesh vaghala | H K Staff | Duven | Duven | pankaj.bihola | 4 floor, common room, 1 staircase, dusting |
| 34 | 435 | Umesh Babariya | Reliver | Duven | Duven | pankaj.bihola | |
| 35 | 239 | Shailesh Rathod | H K Staff | Emiet | Emiet | pankaj.bihola | 4 pantry, 30 rooms, 1 staircase, dustbin cleaning, terrace cleaning every Sunday |
| 36 | 131 | Dhiraj | H K Staff | Emiet | Emiet | pankaj.bihola | 12 washrooms, 1 staircase, common cleaning |
| 37 | 259 | jaydeep Solanki | H K Staff | Emiet | Emiet | pankaj.bihola | 4 floor, common room, 1 staircase, dusting |
| 38 | 121 | Rajendra | Reliver | Emiet | Emiet | pankaj.bihola | |
| 39 | 104 | Rajesh Talvadi | H K Staff | Firpeal | Firpeal | anil.solanki | 4 floor, 1 staircase, dusting, common cleaning |
| 40 | 258 | Mayur Solanki | H K Staff | Firpeal | Firpeal | anil.solanki | 4 pantry, 30 rooms, 1 staircase, dustbin cleaning, terrace cleaning every Sunday |
| 41 | 157 | Jagdish chavda | H K Staff | Firpeal | Firpeal | anil.solanki | 12 washrooms, 1 staircase dusting |
| 42 | 446 | Nikul Solanki | H K Staff | Griwiksh | Griwiksh | anil.solanki | 4 floor, 1 staircase, dusting, bridge cleaning |
| 43 | 95 | jitendra piwal | H K Staff | Griwiksh | Griwiksh | anil.solanki | 12 washrooms, 1 staircase dusting |
| 44 | 261 | Nitin Makwana | Reliver | Griwiksh | Griwiksh | anil.solanki | |
| 45 | 73 | Suresh Solanki | H K Staff | Griwiksh | Griwiksh | anil.solanki | 4 pantry, rooms, 1 staircase, dustbin cleaning, terrace cleaning every Sunday, common cleaning |
| 46 | 148 | Mahendra Makwana | H K Staff | Hiqom | Hiqom | nikul.bihola | Floor: two floor cleaning, 8 balcony cleaning, all dusting, one staircase, hostel common area room cleaning |
| 47 | 75 | Hasmukhbhai | Reliver | Hiqom | Hiqom | nikul.bihola | |
| 48 | 110 | Amit | H K Staff | Hiqom | Hiqom | nikul.bihola | Washroom: 8 washrooms cleaning, washroom dusting, one staircase cleaning |
| 49 | 153 | Rajnikant | H K Staff | Hiqom | Hiqom | nikul.bihola | Washroom: 8 washrooms cleaning, washroom dusting, one staircase cleaning |
| 50 | 256 | Mehul Rathod | H K Staff | Hiqom | Hiqom | nikul.bihola | 4 pantry, 24 rooms, 1 staircase, dustbin cleaning, terrace cleaning every Sunday |
| 51 | 242 | Prahlad Parmar | H K Staff | Hiqom | Hiqom | nikul.bihola | Floor: two floor cleaning, 8 balcony cleaning, all dusting, one staircase, hostel common area room cleaning |
| 52 | 386 | Mittal ben Vaghela | H K Staff | Ijokha | Ijokha | rhushita.chavda | Room: 18 room cleaning, staircase cleaning, common room cleaning, common area cleaning |
| 53 | 230 | Geeta ben parmar | H K Staff | Ijokha | Ijokha | rhushita.chavda | Washroom: 12 washroom cleaning, pantry cleaning |
| 54 | 143 | kailash b parmar | H K Staff | Ijokha | Ijokha | rhushita.chavda | Floor: 4 floor cleaning, dusting, common terrace cleaning, balcony cleaning |
| 55 | 449 | Jaykesh | H K Staff | Jurqia | Jurqia | jaimin.parmar | 4 floor cleaning, common room cleaning, common terrace cleaning, common area cleaning, dusting |
| 56 | 89 | Naresh | H K Staff | Jurqia | Jurqia | jaimin.parmar | 8 washrooms, 1 staircase, 4 balcony cleaning |
| 57 | 106 | Mehul Jadeja | H K Staff | Jurqia | Jurqia | jaimin.parmar | 18 room cleaning, 4 pantry cleaning, 1 staircase cleaning, all dustbin cleaning, terrace cleaning |
| 58 | 136 | Vinay | Reliver | Jurqia | Jurqia | jaimin.parmar | |
| 59 | 122 | Harish | H K Staff | Jurqia | Jurqia | jaimin.parmar | 8 washrooms, 1 staircase, 4 balcony cleaning |
| 60 | 91 | pravinbhai mahida | H K Staff | Kyzeel | Kyzeel | ramprakash.parmar | Washroom: 10 washroom cleaning, washroom dusting |
| 61 | 154 | Lala | Reliver | Kyzeel | Kyzeel | ramprakash.parmar | |
| 62 | 283 | Solanki Chandrakant | H K Staff | Kyzeel | Kyzeel | ramprakash.parmar | Floor: two floor cleaning, 8 balcony cleaning, 3 staircase cleaning, hostel common area room cleaning |
| 63 | 113 | Satishbhi | H K Staff | Kyzeel | Kyzeel | ramprakash.parmar | Floor: two floor cleaning, 8 balcony cleaning, 3 staircase cleaning, common room cleaning |
| 64 | 97 | Shailesh Talvadi | H K Staff | Kyzeel | Kyzeel | ramprakash.parmar | Washroom: 10 washroom cleaning, washroom dusting |
| 65 | 310 | Anandkumar parmar | H K Staff | Kyzeel | Kyzeel | ramprakash.parmar | Room: 30 room cleaning, 4 pantry cleaning, dustbin work, terrace cleaning every Sunday |
| 66 | 88 | Mukesh | Reliver | Lekhaag | Lekhaag | jaimin.parmar | |
| 67 | 245 | Ravi | H K Staff | Lekhaag | Lekhaag | jaimin.parmar | 4 floor cleaning, common room cleaning, common terrace cleaning, common area cleaning, dusting |
| 68 | 149 | Banshi | H K Staff | Lekhaag | Lekhaag | jaimin.parmar | 6 washrooms, staircase, 4 balcony cleaning |
| 69 | 246 | pravin Vaghela | H K Staff | Lekhaag | Lekhaag | jaimin.parmar | 6 washrooms, 1 staircase, 4 balcony cleaning |
| 70 | 438 | Rakesh | H K Staff | Lekhaag | Lekhaag | jaimin.parmar | 16 room cleaning, 4 pantry cleaning, 1 staircase cleaning, all dustbin cleaning weekly Sunday, terrace cleaning |

## Worker Type Inference

Use this order:

1. If category is `Reliver`, set `worker_type='reliever'` and `is_reliever=True`.
2. If `Work` contains `washroom`, set `worker_type='washroom'`.
3. If `Work` contains `room`, set `worker_type='room'`, unless it is clearly only `common room` under floor/common duties.
4. If `Work` contains `floor`, `staircase`, `balcony`, `dusting`, `common area`, or `road`, set `worker_type='floor'` or `general` based on existing project patterns.
5. If uncertain, default to `general`.

Do not rely only on this inference if an existing `HKWorker` already has a meaningful `worker_type`; update only when Excel gives clearer information.

## Required Deliverable

Create a Django management command:

```bash
python manage.py import_housekeeping_staff_excel "C:\Users\Sarthak\Downloads\Hk Staff (2).xlsx"
```

Suggested location:

```txt
backend/apps/housekeeping/management/commands/import_housekeeping_staff_excel.py
```

If Excel parsing requires a dependency, add it to:

```txt
backend/requirements.txt
```

Prefer `openpyxl`.

## Safety Rules

Do not delete any existing records.

Never:

- Delete workers.
- Soft delete workers.
- Set `is_active=False` automatically.
- Remove historical records.
- Recreate workers if a matching worker already exists.
- Change primary keys.
- Break attendance, task assignment, inventory, reports, or audit history.

Preserve:

- `HKAttendanceRecord`
- `HKDailyRecord`
- `HKTaskWorkerAssignment`
- `HKWorkerSelectionRequest`
- Worker reports
- Inventory usage/history

## Matching Rules

Primary match:

- Match existing `HKWorker` by normalized `pay_code`.

Normalize pay codes:

- Trim whitespace.
- Convert numeric Excel values like `357.0` to `357`.
- Preserve meaningful leading zeroes.
- Treat blank/null/`nan` as missing.

Fallback match:

- If pay code is unavailable, match by normalized worker name + normalized target area.
- Use fallback only when exactly one worker matches.

Ambiguous matches:

- If multiple existing workers match a row, skip and report.

Duplicates:

- The current workbook has no duplicate pay codes, but the command must still detect duplicates in future files.

## Upsert Rules For HKWorker

For an existing worker:

- Update fields present in Excel only.
- Do not overwrite meaningful existing fields with blanks.
- Preserve ID and history.

Fields to map:

- `HKWorker.name`
- `HKWorker.pay_code`
- `HKWorker.area`
- `HKWorker.supervisor`
- `HKWorker.worker_type`
- `HKWorker.is_reliever`

For a new worker:

- Create `HKWorker`.
- Set `is_active=True`.
- Populate all available fields.
- Assign area and supervisor if resolved.
- Do not create attendance/task history.

## User Synchronization

For this workbook:

- Do not create `User` records for the 69 staff rows.
- Use the supervisor mapping above only to link `HKWorker.supervisor`.

For future workbooks containing supervisor/caretaker rows:

- Match `User` by pay code first.
- Fall back to normalized name/username.
- Use existing helpers from `apps.users.models`.
- Do not reset existing passwords.
- Use `HKUserArea` for assigned area links.

## Admin Portal Synchronization

Ensure imported workers appear in:

- `frontend-admin/src/pages/housekeeping/WorkersTab.jsx`
- `frontend-admin/src/pages/housekeeping/AttendanceTab.jsx`
- `frontend-admin/src/pages/housekeeping/SupervisorsTab.jsx`
- `frontend-admin/src/pages/housekeeping/SectionsTab.jsx`

Search/filter must support:

- Worker name
- Pay code
- Area
- Supervisor name

Backend areas:

- `backend/apps/housekeeping/api_views.py`
- `backend/apps/housekeeping/serializers.py`

## Staff Portal Synchronization

Ensure imported workers appear immediately in:

- Attendance lists
- Task assignment dropdowns/checklists
- Area-filtered worker lists
- Supervisor/caretaker views

Relevant files:

- `backend/apps/housekeeping/htmx_views.py`
- `backend/templates/housekeeping/mobile/attendance.html`
- `backend/templates/housekeeping/mobile/dashboard.html`
- `backend/templates/housekeeping/mobile/partials/task_card.html`
- `backend/templates/housekeeping/mobile/partials/attendance_worker_card.html`

Show pay code beside worker name in selection and assignment UI:

```txt
Reeta ben (357)
Sangeeta ben (219)
shilpa ben (419)
```

Preserve:

- `display_workers_for_area`
- `display_worker_ids_for_area`
- reliever pool behavior
- SWM multi-worker assignment behavior

## Import Report

Print a summary:

```txt
Housekeeping Staff Import Complete

Rows Parsed: 69
Workers Created: XX
Workers Updated: XX
Workers Skipped: XX
Users Created: 0
Users Updated: 0
Areas Created: XX
Supervisor Not Found: XX
Duplicate Rows: 0
Ambiguous Matches: XX
Errors: XX
```

Print detail sections:

```txt
Supervisor Not Found:
- <label from Excel> -> <expected username>

Areas Created:
- <area name>

Ambiguous Matches:
- Row <n>: <reason>

Errors:
- Row <n>: <reason>
```

Add dry-run support:

```bash
python manage.py import_housekeeping_staff_excel "C:\Users\Sarthak\Downloads\Hk Staff (2).xlsx" --dry-run
```

Dry run must parse, resolve, and report without saving.

## Idempotency

Running the same workbook repeatedly must not:

- Create duplicate workers.
- Create duplicate users.
- Create duplicate `HKUserArea` links.
- Change historical records.
- Disable old workers.

## Validation

Before insert/update:

- Skip completely empty rows.
- Trim whitespace.
- Normalize repeated spaces.
- Normalize names.
- Normalize pay codes.
- Handle blank `Work` cells gracefully.
- Validate `worker_type` against `HKWorker.WORKER_TYPE_CHOICES`.
- Default unknown worker type to `general`.
- Do not overwrite existing values with blanks.

## Acceptance Criteria

- All 69 workbook rows are processed.
- Existing workers remain present.
- No worker is deleted or disabled.
- Existing worker IDs are preserved.
- Workers are matched by pay code where possible.
- New workers are created only when no matching worker exists.
- `Beauki` maps to existing `Beuaki`.
- JRHA block labels map to `Jeet Hostel Block A/B/C/D`.
- `Common Area & Mess` maps to `Hostel Common Area`.
- Reliever rows set `is_reliever=True`.
- Supervisor links use the exact mapping above.
- Missing supervisors are reported without failing import.
- Imported workers appear in admin Housekeeping screens.
- Imported workers appear in staff attendance and assignment screens.
- Pay code appears beside worker names in selection UI.
- Import is idempotent.
- `--dry-run` works.
- No attendance, task assignment, inventory, reporting, or history workflow regresses.
