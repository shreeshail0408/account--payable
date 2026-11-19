# Local setup and deployment guide

## Local development

Use PostgreSQL; SQLite is not supported. Install Python dependencies and PostgreSQL, then from the project root:

```bash
cd backend
python3 -m pip install -r requirements.txt
cp .env.example .env
# Set POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST and POSTGRES_PORT in backend/.env.
python3 manage.py migrate
python3 manage.py create_ap_admin
python3 manage.py runserver 0.0.0.0:8000
```

The admin command prompts for the first administrator password without echoing it. Do not paste passwords into chat or commit `.env`. For the frontend, in another terminal:

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL if the backend is not at http://localhost:8000/api.
npm run dev
```

Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin (including its port). Use the actual PostgreSQL host/credentials before running migrations or tests. Never point a test run at a database containing production data; Django creates a separate test database and the PostgreSQL user needs permission to create it.

## Production preparation

Set `DJANGO_DEBUG=false`, a long random `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, PostgreSQL credentials, and the HTTPS/CORS settings in a protected environment manager. Terminate HTTPS at a configured trusted proxy, set secure proxy settings only when that proxy overwrites forwarded-protocol headers, configure private media storage and backups, and use a production WSGI/ASGI server rather than `runserver`. Review `python manage.py check --deploy` output in the target deployment. The app has not been deployed or verified against the user's production PostgreSQL instance by this workspace audit.

Apply migrations only after reviewing the migration plan and taking a database backup:

```bash
python3 manage.py showmigrations
python3 manage.py migrate --plan
python3 manage.py migrate
```

## Scheduled work and external services

- IMAP capture: set authorized `IMAP_*` credentials and run `python3 manage.py ingest_email_invoices --once` or a supervised polling worker.
- Reminders/escalation: schedule `python3 manage.py process_approvals` at an appropriate interval.
- SMTP: configure `SMTP_*`, then run/schedule `python3 manage.py send_ap_notifications`.
- GST, ERP, bank: configure authorized HTTPS endpoints and bearer tokens as documented in `backend/.env.example`; test against provider sandbox contracts first. HTTP success from bank submission means accepted for processing, not settled funds.
- Local semantic extraction: install/run Ollama locally, set `LOCAL_LLM_BASE_URL` to loopback and `LOCAL_LLM_MODEL` to an installed model name. No model/runtime is bundled.

Unconfigured integrations are unavailable; the application does not claim they succeeded. “Record demo payment” only changes local records and does not transfer money. `seed_demo` is disabled unless `DEBUG=true` and `AP_ALLOW_DEMO_SEED=true`; never use it against production data.
