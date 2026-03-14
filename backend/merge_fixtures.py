import json
import os

MAIN_FIXTURE = 'fixtures/housekeeping.json'
TEMP_FIXTURE = 'fixtures/housekeeping_templates_updated.json'

print("Loading main fixture...")
with open(MAIN_FIXTURE, 'r', encoding='utf-16') as f:
    main_data = json.load(f)

print("Loading temp fixture...")
with open(TEMP_FIXTURE, 'r', encoding='utf-16') as f:
    temp_data = json.load(f)

print(f"Main fixture objects: {len(main_data)}")
print(f"Updated templates objects: {len(temp_data)}")

# Filter out old hkscheduletemplate and hkdailyrecord from main_data
# We keep area, supplyitems, shift, etc.
filtered_main = [
    item for item in main_data
    if item['model'] not in ('housekeeping.hkscheduletemplate', 'housekeeping.hkdailyrecord')
]

# Merge the updated templates back into the main fixture list
merged_data = filtered_main + temp_data

print(f"New Main fixture objects: {len(merged_data)}")

# Write back to main fixture maintaining UTF-16
with open(MAIN_FIXTURE, 'w', encoding='utf-16') as f:
    json.dump(merged_data, f, indent=4)

print("Merge complete.")
