# IITGN Beta Server Deployment Guide

This guide is for the **internal beta deployment** on the IITGN server.

Important scope:

- This project currently runs with **Django `runserver`** and **Vite dev server** inside Docker.
- That is acceptable for **internal beta testing**.
- It is **not** the final production architecture.
- After beta, the proper production setup should be `Nginx + Gunicorn + built frontend`.

This guide assumes the IITGN server is **Ubuntu Linux** and you get:

- server IP or domain
- SSH username
- SSH password or SSH key
- permission to install Docker


## 1. What IITGN Must Give You

Before deployment, ask IITGN for these exact things:

1. Server public IP or domain name
2. SSH access
3. Ubuntu version
4. Whether Docker is already installed
5. Firewall rules

For beta, these ports must be reachable:

- `22` for SSH
- `5173` for admin frontend
- `8000` for backend API and staff portal

These should **not** be publicly open if possible:

- `5432` Postgres
- `6379` Redis

If IITGN controls firewall, tell them:

- allow public access to `5173` and `8000`
- block public access to `5432` and `6379`


## 2. What Users Will Open

After deployment, the main URLs are:

- Admin frontend login: `http://SERVER_IP:5173/login`
- Staff portal login: `http://SERVER_IP:8000/portal/login/`
- Backend health/root: `http://SERVER_IP:8000/`
- API root: `http://SERVER_IP:8000/api/`
- Restricted Django admin: `http://SERVER_IP:8000/manage/iitgn-staff/`

Use the actual server IP or domain instead of `SERVER_IP`.


## 3. Seeded Accounts You Already Have

On a **fresh empty database**, the seed creates these main accounts:

- `admin`
- `inv.manager`
- `housekeeping.manager`
- `horticulture.manager`

Default password on fresh DB:

- `IITGN@2025`

Important:

- the seed only sets password when the user is created the first time
- if the DB already exists, old passwords stay unchanged
- after first successful login, change passwords immediately


## 4. First Time Server Setup

SSH into the server:

```bash
ssh YOUR_USER@SERVER_IP
```

Update packages:

```bash
sudo apt update
sudo apt upgrade -y
```

Install Git:

```bash
sudo apt install -y git
```

Install Docker and Docker Compose plugin if not already installed:

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Allow your user to run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Verify Docker:

```bash
docker --version
docker compose version
```


## 5. Get the Project on the Server

Choose a folder, for example:

```bash
mkdir -p ~/apps
cd ~/apps
```

Clone the repository:

```bash
git clone YOUR_REPO_URL inventory-management
cd inventory-management
```

If the repo is already on the server:

```bash
cd ~/apps/inventory-management
git pull
```


## 6. Create the `.env` File for IITGN Server

Copy the example:

```bash
cp .env.example .env
```

Open it:

```bash
nano .env
```

Use this as the starting template:

```env
DEBUG=False
SECRET_KEY=replace-with-a-long-random-secret
ALLOWED_HOSTS=SERVER_IP,localhost,127.0.0.1,backend

DB_NAME=inventory_db
DB_USER=postgres
DB_PASSWORD=replace-with-strong-password
DB_HOST=db
DB_PORT=5432

REDIS_URL=redis://redis:6379/0

CORS_ALLOWED_ORIGINS=http://SERVER_IP:5173
VITE_API_URL=http://SERVER_IP:8000/api
```

Replace:

- `SERVER_IP` with the real IITGN server IP or domain
- `SECRET_KEY` with a strong random string
- `DB_PASSWORD` with a strong password

If IITGN gives you a domain instead of raw IP, use that domain everywhere:

- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `VITE_API_URL`

Good way to generate a Django secret key:

```bash
python3 - <<'PY'
from django.core.management.utils import get_random_secret_key
print(get_random_secret_key())
PY
```


## 7. Deploy the Project

From the repo root:

```bash
docker compose up -d --build
```

What happens during backend startup:

1. migrations run
2. initial seed runs only if needed
3. inventory sync runs
4. monthly purchase plan sync runs
5. name/pay-code sync runs
6. static files collect
7. Django starts on port `8000`

Important:

- backend startup is **not instant**
- wait around **20 to 60 seconds**
- do not assume failure immediately after `up -d --build`


## 8. Verify the Deployment

Check container status:

```bash
docker compose ps
```

Watch backend logs:

```bash
docker compose logs -f backend
```

You want to see this line:

```text
Starting development server at http://0.0.0.0:8000/
```

Check frontend logs:

```bash
docker compose logs -f frontend-admin
```

Quick HTTP checks:

```bash
curl http://SERVER_IP:8000/
curl http://SERVER_IP:8000/api/
```

If the app is running, those URLs will respond from Django.


## 9. How Admin Will Use the System

Admin uses the React frontend:

- URL: `http://SERVER_IP:5173/login`
- username: `admin`
- password on fresh DB: `IITGN@2025`

After login, admin can use:

- dashboard
- inventory
- housekeeping
- horticulture
- reports
- users
- insights

Restricted Django admin is separate:

- URL: `http://SERVER_IP:8000/manage/iitgn-staff/`
- use only if you specifically need model-level admin access


## 10. How Staff Will Use the System

Staff do **not** use the admin frontend login.

Staff use:

- `http://SERVER_IP:8000/portal/login/`

Role behavior:

- `inventory_manager` goes to inventory mobile/manager pages
- `housekeeping_manager` goes to housekeeping dashboard
- `horticulture_manager` goes to horticulture dashboard
- `supervisor` and `caretaker` go to housekeeping dashboard

Admin should use the admin frontend login at port `5173`, not the staff portal.


## 11. First Day Checklist for Beta Testing

After deployment, do this in order:

1. Open `http://SERVER_IP:5173/login`
2. Login as `admin`
3. Confirm dashboard loads
4. Open inventory page
5. Open housekeeping page
6. Open reports page
7. Open monthly inventory tab
8. Test one staff login at `http://SERVER_IP:8000/portal/login/`
9. Confirm media/photos upload if housekeeping photo flow is part of testing
10. Change default passwords


## 12. Daily Operating Commands

See running containers:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend-admin
```

Restart only backend:

```bash
docker compose restart backend
```

Restart everything:

```bash
docker compose restart
```

Stop everything:

```bash
docker compose down
```

Start again:

```bash
docker compose up -d
```


## 13. How to Update After Code Changes

Whenever you push new code and want IITGN server to update:

```bash
cd ~/apps/inventory-management
git pull
docker compose up -d --build
docker compose logs -f backend
```

Wait until backend logs show Django started successfully.


## 14. Database Backup Before Beta or Before Update

Create SQL backup:

```bash
docker compose exec -T db pg_dump -U postgres inventory_db > backup_$(date +%F_%H-%M-%S).sql
```

If your DB user or DB name is different, replace them accordingly.

Back up uploaded media:

```bash
docker run --rm \
  -v inventory-management_media_files:/from \
  -v $(pwd):/to \
  alpine sh -c "cd /from && tar czf /to/media_backup_$(date +%F_%H-%M-%S).tar.gz ."
```


## 15. Restore Backup

If you need to restore DB:

```bash
cat backup_file.sql | docker compose exec -T db psql -U postgres -d inventory_db
```


## 16. Common Problems and Fixes

### Problem: frontend opens but API calls fail

Most likely cause:

- wrong `VITE_API_URL` in `.env`

Fix:

1. correct `.env`
2. rebuild:

```bash
docker compose up -d --build frontend-admin
```


### Problem: backend container is up but browser still fails

Check:

```bash
docker compose logs backend --tail=100
docker compose ps
```

Also verify port:

```bash
curl http://SERVER_IP:8000/
```


### Problem: CORS error in browser

Most likely cause:

- `CORS_ALLOWED_ORIGINS` does not match the actual frontend URL

Fix example:

```env
CORS_ALLOWED_ORIGINS=http://SERVER_IP:5173
```

Then rebuild/restart backend:

```bash
docker compose up -d --build backend
```


### Problem: admin login works locally but not on server

Check:

- `ALLOWED_HOSTS`
- `VITE_API_URL`
- `CORS_ALLOWED_ORIGINS`
- backend logs


## 17. What I Recommend You Tell IITGN Tomorrow

Tell them this directly:

1. This is a **beta/internal Docker deployment**
2. They need to provide:
   - Linux server access
   - public IP or domain
   - ports `5173` and `8000`
3. You will deploy with Docker Compose
4. Admin will use port `5173`
5. Staff will use port `8000`
6. Database and Redis should not be exposed publicly


## 18. Current Technical Limitation

For beta, this is acceptable.

For final production, this should later be changed to:

- Nginx reverse proxy
- Gunicorn for Django
- built static frontend instead of Vite dev server
- HTTPS
- no public DB/Redis ports


## 19. Short Version if You Need It Fast Tomorrow

On server:

```bash
git clone YOUR_REPO_URL inventory-management
cd inventory-management
cp .env.example .env
nano .env
docker compose up -d --build
docker compose logs -f backend
```

Then open:

- Admin: `http://SERVER_IP:5173/login`
- Staff: `http://SERVER_IP:8000/portal/login/`

