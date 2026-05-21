# Management System

Dockerized management system with a Django backend, React admin frontend, and staff-facing mobile/PWA workflows for campus operations.

## Entry Points

- `/admin-portal/` - React SPA for admin users
- `/portal/login/` - staff login entry for non-admin users

## Staff Redirects After `/portal/login/`

- `inventory_manager` - `/inventory/mobile/`
- `housekeeping_manager` - `/housekeeping/dashboard/`
- `horticulture_manager` - `/horticulture/dashboard/`
- `supervisor`, `caretaker` - `/housekeeping/dashboard/`

## Service URLs

Local development without nginx HTTPS:

- Backend root: `http://localhost:8000/`
- API root: `http://localhost:8000/api/`
- Django admin: `http://localhost:8000/admin/`
- Admin SPA: `http://localhost:5173/`
- Staff login portal: `http://localhost:8000/portal/login/`

Docker/nginx HTTPS setup on a LAN server:

- Staff login portal: `https://SERVER_IP:8443/portal/login/`
- Housekeeping PWA: `https://SERVER_IP:8443/housekeeping/dashboard/`
- Horticulture PWA: `https://SERVER_IP:8443/horticulture/dashboard/`
- Inventory PWA: `https://SERVER_IP:8443/inventory/mobile/`
- React admin dashboard: `https://SERVER_IP:9443/`
- Django admin panel: `https://SERVER_IP:8443/manage/`
- Certificate setup page: `http://SERVER_IP:8000/setup/`
- CA certificate download: `http://SERVER_IP:8000/ca.crt`

Replace `SERVER_IP` with the machine's local network IP address, for example `192.168.1.10`.

## Recent Highlights

- Inventory manager flow includes a stronger issued-items review experience with pending-action handling and improved dashboard visibility.
- Reporting has expanded for inventory operations, including monthly procurement history, CSV/PDF export support, area-wise issued reports, and activity trends.
- Housekeeping and inventory reporting support includes role-oriented CSV workflows and better cross-module visibility from admin dashboards.

## Quick Start

### 1. Clone the repository

```powershell
git clone https://github.com/ShauryaDusht/management-system/
cd management-system
```

### 2. Create the environment file

```powershell
cp .env.example .env
```

Update `.env` for your machine:

```env
SECRET_KEY=replace-with-a-long-random-secret-key
DEBUG=False
SERVER_IP=192.168.1.10

ALLOWED_HOSTS=localhost,127.0.0.1,backend,192.168.1.10

DB_NAME=inventory_db
DB_USER=postgres
DB_PASSWORD=change-this-password
DB_PORT=5432
DB_HOST=db
DB_ENGINE=django.db.backends.postgresql

CORS_ALLOWED_ORIGINS=https://192.168.1.10:9443,https://192.168.1.10:8443
CSRF_TRUSTED_ORIGINS=https://192.168.1.10:9443,https://192.168.1.10:8443
VITE_API_URL=
```

Keep `SERVER_IP`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` aligned with the exact IP address users will open in their browser.

### 3. Generate the local CA and HTTPS certificate

PWA features require HTTPS on phones. This project uses a local Certificate Authority (CA) and nginx TLS certificates so other users on the same network can trust the app.

Run these commands from the project root in PowerShell. Docker runs OpenSSL, so OpenSSL does not need to be installed on the host machine.

```powershell
$SERVER_IP = (Get-Content .env | Where-Object { $_ -match '^SERVER_IP=' }) -replace '^SERVER_IP=', ''

New-Item -ItemType Directory -Force nginx\certs

docker run --rm -v "${PWD}/nginx/certs:/certs" alpine/openssl genrsa -out /certs/ca.key 4096

docker run --rm -v "${PWD}/nginx/certs:/certs" alpine/openssl req -x509 -new -nodes -key /certs/ca.key -sha256 -days 3650 -out /certs/ca.crt -subj "/CN=IITGN-Management-CA"

docker run --rm -v "${PWD}/nginx/certs:/certs" alpine/openssl genrsa -out /certs/local.key 2048

docker run --rm -v "${PWD}/nginx/certs:/certs" alpine/openssl req -new -key /certs/local.key -out /certs/local.csr -subj "/CN=${SERVER_IP}"

@"
subjectAltName=IP:${SERVER_IP},IP:127.0.0.1
extendedKeyUsage=serverAuth
"@ | Set-Content nginx\certs\ext.cnf

docker run --rm -v "${PWD}/nginx/certs:/certs" alpine/openssl x509 -req -in /certs/local.csr -CA /certs/ca.crt -CAkey /certs/ca.key -CAcreateserial -out /certs/local.crt -days 825 -sha256 -extfile /certs/ext.cnf
```

Generated files:

- `nginx/certs/ca.crt` - public CA certificate to install on phones and computers
- `nginx/certs/ca.key` - private CA key; keep this on the server and do not share it
- `nginx/certs/local.crt` and `nginx/certs/local.key` - nginx HTTPS certificate and key

Only share `ca.crt` with users. Never share `ca.key` or `local.key`.

### 4. Build and run services

```powershell
docker compose up -d --build
```

On a fresh database, the project creates the real campus users automatically. The default password for newly created seeded accounts is `IITGN@2025`. On later restarts or deploys, existing passwords are preserved.

## Configure Other Users' Devices

Each user must install and trust the CA certificate once on each phone, tablet, or computer before opening the HTTPS app. Send users to:

```text
http://SERVER_IP:8000/setup/
```

They can also download the CA directly:

```text
http://SERVER_IP:8000/ca.crt
```

After the CA is trusted, users should open:

```text
https://SERVER_IP:8443/portal/login/
```

The app redirects each staff user to the correct dashboard after login.

### Android

1. Open `http://SERVER_IP:8000/setup/` in Chrome.
2. Download the CA certificate from the setup page.
3. Open Android Settings and search for `certificate` or `Install certificates`.
4. Choose `CA certificate` when Android asks for the certificate type.
5. Select the downloaded `ca.crt` file.
6. Name it `IITGN-Management` if prompted.
7. Open Chrome and visit `https://SERVER_IP:8443/portal/login/`.
8. To install the PWA, use Chrome menu then `Add to Home screen` or `Install app`.

Android menus vary by brand. On Samsung One UI, the path is usually Settings search, `Install certificates`, then `Install from device storage`.

### iPhone and iPad

1. Open `http://SERVER_IP:8000/setup/` in Safari.
2. Download the CA certificate and tap `Allow` if iOS asks to download a profile.
3. Open Settings, then General, then VPN & Device Management.
4. Tap the downloaded profile, then tap Install.
5. Open Settings, then General, then About, then Certificate Trust Settings.
6. Enable full trust for `IITGN-Management-CA`.
7. Open Safari and visit `https://SERVER_IP:8443/portal/login/`.
8. To install the PWA, tap Share, then `Add to Home Screen`.

iOS requires both profile installation and full trust. Installing the profile alone is not enough.

### Windows

For developers and admin users, run PowerShell as Administrator from the project root:

```powershell
Import-Certificate -FilePath "nginx\certs\ca.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

Restart Chrome or Edge after importing the certificate.

## PWA Usage

PWA installation works only after the device trusts the CA and the app is opened over HTTPS.

- Android: open `https://SERVER_IP:8443/portal/login/` in Chrome, then use `Install app` or `Add to Home screen`.
- iPhone/iPad: open the same URL in Safari, then Share, then `Add to Home Screen`.
- Admin users should use `https://SERVER_IP:9443/` for the React dashboard.
- Staff users should use `https://SERVER_IP:8443/portal/login/`; role-based redirects handle the correct module.

## Certificate Renewal

The server certificate `local.crt` expires after 825 days. To renew it, regenerate `local.key`, `local.csr`, and `local.crt` using the existing `ca.crt` and `ca.key`.

Users do not need to reinstall the CA certificate as long as the same CA is used. Users must reinstall only if `ca.crt` or `ca.key` is replaced with a new CA.

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser says the certificate is not trusted | Install `ca.crt` as a CA certificate, not `local.crt`. On iOS, also enable full trust in Certificate Trust Settings. |
| PWA install option is missing | Open the app over HTTPS after trusting the CA. iOS requires Safari for Add to Home Screen. |
| Phone cannot reach the server | Confirm the phone is on the same WiFi/LAN and firewall allows ports `8000`, `8443`, and `9443`. |
| CSRF errors | Ensure `.env` uses the same `SERVER_IP` that appears in the browser address bar, then restart containers. |
| Django `ALLOWED_HOSTS` error | Add the server IP to `ALLOWED_HOSTS` in `.env`, then restart containers. |
| Admin dashboard API calls fail | Confirm `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, and the frontend URL use HTTPS and the same server IP. |
| Mixed content errors | Ensure app URLs and API calls use HTTPS, not HTTP, except for the setup and CA download pages. |

## Module Documentation

- Beta server deployment: `BETA_SERVER_DEPLOYMENT.md`
- Inventory: `backend/apps/inventory/README.md`
- Housekeeping: `backend/apps/housekeeping/README.md`
- Horticulture: `backend/apps/horticulture/README.md`
- Horticulture module status: summary API and dashboard are active; detailed APIs are pending.
