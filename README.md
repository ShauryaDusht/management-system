# Management System

Dockerized management system with Django backend + React admin frontend.

## Entry Points
- `/admin-portal/` → React SPA for `admin` (dev: `http://localhost:5173`)
- `/portal/login/` → staff login entry for non-admin users

## Staff redirects after `/portal/login/`
- `inventory_manager` → `/inventory/mobile/`
- `housekeeping_manager` → `/housekeeping/dashboard/`
- `horticulture_manager` → `/horticulture/dashboard/`
- `supervisor`, `caretaker` → `/housekeeping/dashboard/`

## Service URLs
- Backend root: http://localhost:8000/
- API root: http://localhost:8000/api/
- Django admin: http://localhost:8000/admin/
- Admin SPA (Vite dev): http://localhost:5173/
- Staff login portal: http://localhost:8000/portal/login/

## Recent Highlights
- Inventory manager flow now includes a stronger issued-items review experience with pending-action handling and improved dashboard visibility.
- Reporting has been expanded for inventory operations (monthly procurement history, CSV/PDF export support, area-wise issued reports, and activity trends).
- Housekeeping and inventory reporting support has expanded with role-oriented CSV workflows and better cross-module visibility from admin dashboards.

## Quick Start (Docker)
1. **Clone the repository**
   ```bash
   git clone https://github.com/ShauryaDusht/management-system/
   cd management-system
   ```
2. **Create environment file**
   ```bash
   cp .env.example .env
   ```
3. **Update environment values (`.env`)**
   ```env
   SECRET_KEY=replace-with-a-long-random-string
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1,backend

   DB_NAME=inventory_db
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_PORT=5432
   DB_HOST=db

   REDIS_URL=redis://redis:6379/0
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   VITE_API_URL=http://localhost:8000/api
   ```
4. **Build and run services**
   ```bash
   docker compose up -d --build
   ```
5. **Use seeded real accounts**
   - on a fresh DB, the project creates the real campus users automatically
   - default password for newly created seeded accounts is `IITGN@2025`
   - on later restarts or deploys, existing passwords are preserved

## Module Documentation
- Beta server deployment: [`BETA_SERVER_DEPLOYMENT.md`](BETA_SERVER_DEPLOYMENT.md)
- Inventory: [`backend/apps/inventory/README.md`](backend/apps/inventory/README.md)
- Housekeeping: [`backend/apps/housekeeping/README.md`](backend/apps/housekeeping/README.md)
- Horticulture: [`backend/apps/horticulture/README.md`](backend/apps/horticulture/README.md)
- Horticulture module status: summary API and dashboard are active; detailed APIs are pending.

## Testing PWA on a phone over local HTTPS

PWA features require HTTPS even on a local network. To test on your phone without a domain:

Step 1 - Install mkcert: https://github.com/FiloSottile/mkcert then run: mkcert -install

Step 2 - Generate a certificate for your local IP (e.g. 192.168.1.10):
mkcert 192.168.1.10
This creates: 192.168.1.10.pem and 192.168.1.10-key.pem

Step 3 - Trust the certificate on iPhone:
Run: mkcert -CAROOT to find rootCA.pem
AirDrop or email rootCA.pem to iPhone
Settings → General → VPN & Device Management → install the profile
Settings → General → About → Certificate Trust Settings → enable full trust for mkcert

Step 4 - Trust the certificate on Android:
Email rootCA.pem to Android phone
Settings → Security → Install a certificate → CA certificate → select the file

Step 5 - Run Django with the certificate:
pip install django-extensions Werkzeug pyOpenSSL
python manage.py runserver_plus --cert-file 192.168.1.10.pem --key-file 192.168.1.10-key.pem 0.0.0.0:8000

Step 6 - Open on your phone:
iPhone → Safari → https://192.168.1.10:8000/housekeeping/dashboard/
Android → Chrome → https://192.168.1.10:8000/housekeeping/dashboard/
