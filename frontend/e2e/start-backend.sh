#!/usr/bin/env bash
# Starts an isolated Django backend for Playwright on a throwaway database.
# It DROPS and recreates $E2E_DB (default ap_e2e) on every run; it never touches the dev database.
# Connection credentials come from backend/.env (POSTGRES_USER/PASSWORD/HOST/PORT).
set -euo pipefail
cd "$(dirname "$0")/../../backend"

export POSTGRES_DB="${E2E_DB:-ap_e2e}"
case "$POSTGRES_DB" in
  *e2e*) ;;
  *) echo "Refusing to reset '$POSTGRES_DB': the e2e database name must contain 'e2e'." >&2; exit 1 ;;
esac
export DJANGO_DEBUG=true
export DJANGO_SECRET_KEY="${E2E_SECRET_KEY:-e2e-only-secret-key-not-for-production-0123456789abcdef}"
export AP_ALLOW_DEMO_SEED=true
export DEMO_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-e2e-Admin-Pass-2026}"
export DEMO_APPROVER_PASSWORD="${E2E_APPROVER_PASSWORD:-e2e-Approver-Pass-2026}"
export CORS_ALLOWED_ORIGINS="http://localhost:${E2E_WEB_PORT:-5190},http://127.0.0.1:${E2E_WEB_PORT:-5190}"
# Optional integrations stay off so the UI shows its demo/not-configured states.
export LOCAL_LLM_MODEL="" ERP_API_URL="" BANK_API_URL="" GST_API_URL="" IMAP_HOST="" SMTP_HOST=""

python3 - <<'PY'
import os
import psycopg2
from psycopg2 import sql
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ap_backend.settings")
django.setup()
from django.conf import settings
db = settings.DATABASES["default"]
conn = psycopg2.connect(dbname="postgres", user=db["USER"], password=db["PASSWORD"], host=db["HOST"], port=db["PORT"])
conn.autocommit = True
with conn.cursor() as cur:
    # Works on PostgreSQL < 13 (no DROP ... WITH (FORCE)): close other sessions first.
    cur.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()", [db["NAME"]])
    cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(db["NAME"])))
    cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db["NAME"])))
conn.close()
print(f"Reset database {db['NAME']}")
PY

python3 manage.py migrate --noinput -v 0
python3 manage.py seed_demo
LOG="$(dirname "$0")/../frontend/e2e/.results/backend.log"
mkdir -p "$(dirname "$LOG")"
echo "Backend request log: $LOG"
exec python3 manage.py runserver "127.0.0.1:${E2E_API_PORT:-8020}" --noreload 2>"$LOG"
