import re
import sqlite3
import os
import sys

def restore():
    sql_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backup_20260607_000531.sql'))
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db.sqlite3'))

    print(f"Reading SQL dump from: {sql_path}")
    print(f"Target SQLite database: {db_path}")

    if not os.path.exists(sql_path):
        print(f"Error: {sql_path} does not exist!")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Disable foreign keys during restore
    cur.execute("PRAGMA foreign_keys = OFF;")

    with open(sql_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    in_copy = False
    current_table = None
    columns = []
    rows_to_insert = []
    total_tables_restored = 0
    total_rows_restored = 0

    copy_pattern = re.compile(r'^COPY\s+public\.([a-zA-Z0-9_]+)\s*\((.*?)\)\s+FROM\s+stdin;', re.IGNORECASE)

    # First get existing tables in SQLite
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    existing_tables = set(r[0] for r in cur.fetchall())

    for line_idx, line in enumerate(lines):
        line_clean = line.rstrip('\r\n')

        if not in_copy:
            m = copy_pattern.match(line_clean)
            if m:
                table_name = m.group(1)
                cols_raw = m.group(2)
                # Parse columns, handling quotes like "order"
                columns = [c.strip().strip('"') for c in cols_raw.split(',')]
                current_table = table_name
                rows_to_insert = []
                in_copy = True
        else:
            if line_clean == r'\.':
                # End of COPY block
                if current_table in existing_tables:
                    # Clear current table before restoring
                    cur.execute(f'DELETE FROM "{current_table}";')

                    col_names = ', '.join([f'"{c}"' for c in columns])
                    placeholders = ', '.join(['?'] * len(columns))
                    insert_sql = f'INSERT INTO "{current_table}" ({col_names}) VALUES ({placeholders})'

                    cur.executemany(insert_sql, rows_to_insert)
                    conn.commit()
                    print(f"Restored {len(rows_to_insert)} rows into table: {current_table}")
                    total_tables_restored += 1
                    total_rows_restored += len(rows_to_insert)
                else:
                    print(f"Skipping table {current_table} (not in SQLite schema)")

                in_copy = False
                current_table = None
                columns = []
                rows_to_insert = []
            else:
                # Parse tab-separated row
                raw_vals = line_clean.split('\t')
                if len(raw_vals) == len(columns):
                    row = []
                    for v in raw_vals:
                        if v == r'\N':
                            row.append(None)
                        elif v == 't':
                            row.append(1)
                        elif v == 'f':
                            row.append(0)
                        else:
                            # unescape postgres escapes
                            v_clean = v.replace(r'\n', '\n').replace(r'\r', '\r').replace(r'\t', '\t').replace(r'\\', '\\')
                            row.append(v_clean)
                    rows_to_insert.append(row)
                else:
                    # Sometimes multi-line text or mismatch
                    pass

    # Re-enable foreign keys
    cur.execute("PRAGMA foreign_keys = ON;")
    conn.commit()
    conn.close()

    print(f"\n==========================================")
    print(f"RESTORE COMPLETED SUCCESSFULLY!")
    print(f"Total tables restored: {total_tables_restored}")
    print(f"Total rows restored: {total_rows_restored}")
    print(f"==========================================")

if __name__ == '__main__':
    restore()
