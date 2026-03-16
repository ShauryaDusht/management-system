import os

targets = [
    'fixtures/housekeeping_templates_updated.json',
    'fixtures/housekeeping.json',
    'apps/housekeeping/management/commands/seed_housekeeping.py',
]

replacements = {
    'â€”': '-',
    'â”€': '-',
    'â€': '-',
}

def guess_encoding_and_read(file_path):
    encodings = ['utf-8', 'utf-16le', 'utf-16be', 'cp1252', 'latin-1']
    for enc in encodings:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                content = f.read()
            return content, enc
        except UnicodeDecodeError:
            continue
    raise Exception("Could not guess encoding")

for file_path in targets:
    if not os.path.exists(file_path):
        print(f"Skipping {file_path}")
        continue
        
    content, enc = guess_encoding_and_read(file_path)
    print(f"Read {file_path} with {enc}")
    
    modified = False
    for bad, good in replacements.items():
        if bad in content:
            content = content.replace(bad, good)
            modified = True
            
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path} and saved as utf-8")
    else:
        print(f"No changes needed for {file_path}")

print("Done.")
