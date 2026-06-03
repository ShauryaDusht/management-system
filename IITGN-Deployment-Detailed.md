# Detailed IITGN Deployment Guide
### Campus Sanchalika — `campussanchalika.iitgn.ac.in`

---

## Understanding Your Project First

Before steps, you need to know what you're actually deploying:

```
management-system/
├── backend/              ← Django (Python) — serves API + all mobile/portal pages
│   ├── Dockerfile        ← builds Python 3.12 image, installs requirements
│   ├── scripts/
│   │   └── start_backend.sh   ← runs migrations, seeds data, starts Gunicorn
│   └── config/settings.py     ← reads all config from .env
│
├── frontend-admin/       ← React (Vite) — the admin dashboard only (/admin/ route)
│   ├── Dockerfile        ← builds Node 22 image, npm install
│   ├── dist/             ← pre-built files already exist in your zip!
│   └── src/api/client.js ← auto-detects API URL from window.location (no hardcoding)
│
├── nginx/
│   ├── nginx.conf        ← reverse proxy: routes /api/, /admin/, /portal/, etc.
│   └── certs/
│       ├── local.crt     ← REPLACE with IITGN cert
│       └── local.key     ← REPLACE with IITGN key
│
├── docker-compose.yml    ← runs all 4 services: db, backend, frontend-admin, nginx
└── .env                  ← THE only file you configure — everything else reads from here
```

**What happens at startup (automatic — you don't run these manually):**
The `start_backend.sh` script automatically does on every `docker compose up`:
- `collectstatic` — copies all static files
- `migrate` — applies all DB migrations
- `seed_all_data_if_empty` — seeds initial data only if DB is empty
- `update_inventory_items`, `sync_real_inventory_stock`, etc. — sync baseline data
- Starts cron for photo cleanup
- Starts Gunicorn with 3 workers

**Good news about the frontend:** A pre-built `dist/` folder already exists in your zip. The frontend Dockerfile runs `npm run dev` (dev mode), but you have a built version. You can switch to production mode — covered below.

---

## Part A — Things to Do BEFORE the Session (on your own machine)

### A1. Fix the `.env` file

Open `management-system/.env` on your machine and make these exact changes:

**Current `.env`:**
```env
SECRET_KEY=89723gh789d98-0q9wy782c3gb981g287e98abef873r09h8wnhgf298choieawcnf9023rnza90ergh0293ndsui90jgr
DEBUG=False
SERVER_IP=10.7.8.63

ALLOWED_HOSTS=localhost,127.0.0.1,backend,${SERVER_IP},campussanchalika.iitgn.ac.in

DB_NAME=inventory_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_HOST=db
DB_ENGINE=django.db.backends.postgresql

CORS_ALLOWED_ORIGINS=https://${SERVER_IP},https://${SERVER_IP}:8443,https://campussanchalika.iitgn.ac.in
CSRF_TRUSTED_ORIGINS=https://${SERVER_IP},https://${SERVER_IP}:8443,https://campussanchalika.iitgn.ac.in
```

**Change it to:**
```env
SECRET_KEY=89723gh789d98-0q9wy782c3gb981g287e98abef873r09h8wnhgf298choieawcnf9023rnza90ergh0293ndsui90jgr
DEBUG=False
SERVER_IP=<actual server IP — ask professor>

ALLOWED_HOSTS=localhost,127.0.0.1,backend,${SERVER_IP},campussanchalika.iitgn.ac.in

DB_NAME=inventory_db
DB_USER=postgres
DB_PASSWORD=SomeStrongPassword123!
DB_PORT=5432
DB_HOST=db
DB_ENGINE=django.db.backends.postgresql

CORS_ALLOWED_ORIGINS=https://campussanchalika.iitgn.ac.in
CSRF_TRUSTED_ORIGINS=https://campussanchalika.iitgn.ac.in
```

**What changed and why:**
- `SERVER_IP` — update to the real server IP (ask professor beforehand)
- `DB_PASSWORD` — MUST change from default `postgres`, it's a security issue
- `CORS_ALLOWED_ORIGINS` — removed `https://${SERVER_IP}` and `https://${SERVER_IP}:8443` — those were your old IP-based setup, domain handles everything now
- `CSRF_TRUSTED_ORIGINS` — same, domain only

### A2. Fix `docker-compose.yml` — close the PostgreSQL port

Open `management-system/docker-compose.yml`. Find the `db` service and change:

```yaml
# FIND THIS (current):
  db:
    image: postgres:15-alpine
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"        # ← REMOVE THIS — exposes DB to the internet

# CHANGE TO:
  db:
    image: postgres:15-alpine
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    expose:
      - "5432"             # ← internal only, other containers can still reach it
```

The `healthcheck` block stays exactly as-is — don't touch it.

### A3. Switch frontend to production mode (recommended)

Your `dist/` folder already has a built version. The current `docker-compose.yml` runs `npm run dev` which is wasteful for production. Two options:

**Option 1 (easiest) — use the pre-built dist via nginx directly:**

In `docker-compose.yml`, change the `frontend-admin` service command to serve the built files:
```yaml
  frontend-admin:
    build: ./frontend-admin
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./frontend-admin/src:/app/src
    expose:
      - "5173"
    depends_on:
      - backend
    command: npx serve -s dist -p 5173   # ← change from: npm run dev -- --host 0.0.0.0
```

**Option 2 (simpler, fine for IITGN internal use) — keep dev mode as-is.** It works, just uses more memory and shows a Vite HMR banner. No code change needed.

### A4. Clean the `nginx/certs/` folder

Your current `nginx/certs/` has old self-signed CA files that are no longer needed. Keep them out of the zip you'll transfer:
```
nginx/certs/ca.crt      ← old, not needed
nginx/certs/ca.key      ← old private key, don't transfer!
nginx/certs/ca.srl      ← old
nginx/certs/ext.cnf     ← old
nginx/certs/local.csr   ← old
nginx/certs/local.crt   ← WILL BE REPLACED by IITGN cert
nginx/certs/local.key   ← WILL BE REPLACED by IITGN key
```

You can leave them for now — they'll be overwritten. But ideally delete the `ca.key` before zipping.

### A5. Create the transfer zip

On your machine, from the project's parent folder:

```bash
cd /path/to/   # wherever management-system/ folder is

zip -r management-system-iitgn.zip management-system/ \
  --exclude "management-system/frontend-admin/node_modules/*" \
  --exclude "management-system/.git/*" \
  --exclude "management-system/.codex-review/*" \
  --exclude "management-system/backend/**/__pycache__/*" \
  --exclude "management-system/nginx/certs/ca.key"
```

This creates a clean zip without node_modules (huge, not needed) and without the old CA private key.

---

## Part B — On Deployment Day (on the IITGN server via professor's PC)

### B1. Get onto the server

The professor will connect — just watch and note the IP and username they use. Once you see a terminal prompt on the server, you're ready.

### B2. Check what's already there

```bash
# What OS and available tools
cat /etc/os-release
docker --version
docker compose version

# Is the old deployment running?
docker ps
# OR if project was in a specific folder:
ls ~/
ls /opt/ 2>/dev/null
ls /home/ 2>/dev/null
```

If you see containers running from before, note the folder location. You'll need it.

### B3. If Docker is NOT installed (unlikely but possible)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
sudo systemctl enable docker
```

### B4. Copy the project onto the server

**If using a USB drive:**
```bash
# USB usually mounts at /media/ or /mnt/
ls /media/
# Copy from USB
cp /media/<usb-name>/management-system-iitgn.zip ~/
```

**If the professor SCP's it from a local machine:**
```bash
# They'll run something like this from their PC:
scp management-system-iitgn.zip username@server-ip:~/
```

**If you pushed to GitHub:**
```bash
git clone https://github.com/your-org/management-system.git ~/management-system
```

### B5. Extract and go into the folder

```bash
cd ~/
unzip management-system-iitgn.zip
cd management-system
ls -la   # confirm you see: backend/ frontend-admin/ nginx/ docker-compose.yml .env
```

### B6. If there's an OLD deployment running — stop it first

```bash
# Find where the old one lives
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# If it's in this same folder already, stop it
docker compose down
# Note: this does NOT delete your database volume — data is safe
```

### B7. Place the IITGN certificates

The IITGN team will give you two files. They must be named exactly:
- `local.crt` — the certificate
- `local.key` — the private key

```bash
# If they emailed/shared the files and professor copies them over:
cp /path/to/received/cert.crt ~/management-system/nginx/certs/local.crt
cp /path/to/received/cert.key ~/management-system/nginx/certs/local.key

# Lock down permissions on the private key
chmod 600 ~/management-system/nginx/certs/local.key
chmod 644 ~/management-system/nginx/certs/local.crt

# Verify the cert matches the domain
openssl x509 -in nginx/certs/local.crt -noout -text | grep -A3 "Subject:"
# Should show: CN = campussanchalika.iitgn.ac.in (or *.iitgn.ac.in)
```

### B8. Verify your `.env` is correct

```bash
cat .env
```

Confirm:
- `DEBUG=False`
- `SERVER_IP` is the real server IP
- `DB_PASSWORD` is not `postgres`
- `CORS_ALLOWED_ORIGINS` has only `https://campussanchalika.iitgn.ac.in`
- `ALLOWED_HOSTS` includes `campussanchalika.iitgn.ac.in`

If anything needs editing:
```bash
nano .env
# ctrl+O to save, ctrl+X to exit
```

### B9. Build all Docker images

```bash
docker compose build
```

This will take **5–15 minutes** the first time — it downloads base images and installs all Python/Node dependencies. You'll see output scrolling. It's normal. Wait for it.

If it fails on a specific service, the error message will say which one. Most common issue is a network timeout — just run it again.

### B10. Start everything

```bash
docker compose up -d
```

The `-d` runs it in the background. Now watch the logs:

```bash
docker compose logs -f
```

You'll see all 4 services starting. Watch for:
- `db` → `database system is ready to accept connections` ✓
- `backend` → `Collecting static files...` then `Applying database migrations...` then `Seeding data...` then `Starting Gunicorn...` ✓
- `frontend-admin` → server running at `http://0.0.0.0:5173` ✓
- `nginx` → starts last, no errors ✓

The backend startup takes **2–5 minutes** because it seeds all initial data. Don't panic if it's slow.

Press `Ctrl+C` to stop watching logs — services keep running in background.

### B11. Check all containers are healthy

```bash
docker compose ps
```

All 4 should show `running` or `Up`. If any shows `Exit` or `Restarting`, check its logs:
```bash
docker compose logs backend    # most likely culprit
docker compose logs nginx
```

### B12. Test from the server itself

```bash
# HTTP redirect works?
curl -I http://campussanchalika.iitgn.ac.in
# Expected: HTTP/1.1 308 Permanent Redirect

# HTTPS works? (no -k flag — cert should be real and trusted)
curl -I https://campussanchalika.iitgn.ac.in
# Expected: HTTP/1.1 200 OK

# API responding?
curl https://campussanchalika.iitgn.ac.in/api/
# Expected: some JSON response (even if 401 Unauthorized — that's fine, means API is up)
```

### B13. Test in the browser

Open on any device connected to IITGN network:
- `https://campussanchalika.iitgn.ac.in` → portal login page
- `https://campussanchalika.iitgn.ac.in/admin/` → React admin dashboard
- `https://campussanchalika.iitgn.ac.in/manage/iitgn-staff/` → Django admin panel

The browser should show a green padlock — no cert warnings, no "install CA" prompts. That's the key difference from before.

---

## Part C — First Time Only: Create the Superuser

Since this is a fresh deployment (new DB), you need to create the admin user:

```bash
docker compose exec backend python manage.py createsuperuser
```

It will ask for:
- Username
- Email (optional)
- Password

This is your login for `https://campussanchalika.iitgn.ac.in/manage/iitgn-staff/`

---

## Part D — If This Is NOT a Fresh DB (migrating old data)

If you have a database backup from the old IP-based deployment:

```bash
# Copy the backup file to the server first, then:

# Restore into the running postgres container
cat your_backup.sql | docker compose exec -T db psql -U postgres inventory_db

# Then run migrations to apply any new ones
docker compose exec backend python manage.py migrate
```

---

## Part E — Enable Auto-restart on Server Reboot

Your `docker-compose.yml` already has `restart: unless-stopped` on all services. But Docker itself needs to start on boot:

```bash
sudo systemctl enable docker
sudo systemctl status docker   # confirm it's active
```

Now if the server reboots, everything comes back up automatically.

---

## Quick Reference Cheatsheet (save this for day-to-day use)

```bash
# Where to go
cd ~/management-system

# Check status
docker compose ps

# View logs (all services)
docker compose logs -f

# View logs (specific service)
docker compose logs -f backend
docker compose logs -f nginx

# Restart a single service (e.g. after editing nginx.conf)
docker compose restart nginx

# Full restart (no data loss)
docker compose down && docker compose up -d

# Safer app-only update/restart
docker compose up -d --build backend frontend-admin

# Run a Django management command
docker compose exec backend python manage.py <command>

# Get a shell inside backend container
docker compose exec backend bash

# Backup the database
docker compose exec db pg_dump -U postgres inventory_db > backup_$(date +%Y%m%d_%H%M).sql

# Preferred timestamped database backup in /srv/campussanchalika/backups
docker compose exec backend /app/scripts/backup_database.sh

# Back up media separately on the host
sudo tar -czf /srv/campussanchalika/backups/media_$(date +%Y%m%d_%H%M).tar.gz /srv/campussanchalika/media

# When IITGN renews the cert (no downtime needed)
cp new.crt nginx/certs/local.crt
cp new.key nginx/certs/local.key
chmod 600 nginx/certs/local.key
docker compose restart nginx
```

---

## Production Data Safety

Keep these `.env` values in production unless you intentionally want seed-managed data to overwrite dashboard-managed rows:

```env
RUN_SEED_ON_STARTUP=false
RUN_DATA_SYNC_ON_STARTUP=false
RUN_WEEKLY_SEED_UPDATE=false
```

Normal `docker compose down` preserves the named `postgres_data` volume. Do not use `docker compose down -v`, `docker volume rm`, or `docker volume prune` during normal updates because those commands can remove database data.

Weekly cron logs are written under `/app/backups/logs`, mapped to `/srv/campussanchalika/backups/logs`; database backups are stored under `/app/backups`, mapped to `/srv/campussanchalika/backups`.

To apply the one-time housekeeping schedule correction after deploy:

```bash
docker compose exec backend python manage.py apply_hostel_schedule_fixes
```

To restore a custom-format PostgreSQL backup on a test or empty database, copy the `.dump` into a container-mounted path and run:

```bash
docker compose exec -T db pg_restore --clean --if-exists -U postgres -d inventory_db /path/to/backup.dump
```

---

## Common Problems and Fixes

**`502 Bad Gateway` in browser**
- Backend isn't ready yet. Check: `docker compose logs backend`
- Usually it's still seeding data — wait 2 more minutes

**`SSL_ERROR_RX_RECORD_TOO_LONG` or cert warning in browser**
- Cert files not placed correctly, or nginx picked up old self-signed cert
- Verify: `ls -la nginx/certs/` — confirm `local.crt` and `local.key` are the new files
- Then: `docker compose restart nginx`

**Backend container keeps restarting**
- Almost always a `.env` issue — wrong DB password, missing variable
- Run: `docker compose logs backend` and read the first error line

**`django.db.utils.OperationalError` in backend logs**
- DB not ready when backend started — usually self-resolves in 10 seconds
- If persistent: `docker compose restart backend`

**Frontend admin shows blank page**
- Open browser devtools → Console tab
- Usually a CORS or CSRF error — means `.env` CORS_ALLOWED_ORIGINS doesn't include the domain
- Fix `.env`, then: `docker compose restart backend`
