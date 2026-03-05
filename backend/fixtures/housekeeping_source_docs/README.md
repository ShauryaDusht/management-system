Central Arcade + Sports Complex Source Data
==========================================

These files are the source references used to prepare housekeeping worker and schedule data for:

- `Central Arcade`
- `Sports Complex`

Files
-----

- `central_arcade_schedule.jpeg`
- `sports_complex_cleaning.pdf`

Where this data is implemented
------------------------------

Seed logic:

- `backend/apps/housekeeping/management/commands/seed_housekeeping.py`

The seed command creates/updates:

- area assignments for supervisor `bharat.solanki`
- worker records with phone numbers
- daily schedule templates
- Saturday special templates
- Sunday extra/deep-clean templates

How teammates load same data
----------------------------

Use the shared bootstrap command (already used by docker startup):

```bash
python manage.py seed_all_data
```

To also refresh fixtures:

```bash
python manage.py seed_all_data --dump-fixtures
```
