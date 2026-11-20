#!/bin/sh
# Container entrypoint: apply migrations, create the first administrator if AP_ADMIN_PASSWORD is
# set and none exists yet, then serve with gunicorn on $PORT (Render sets it; defaults to 8000).
set -e
python manage.py migrate --noinput
if [ -n "${AP_ADMIN_PASSWORD:-}" ]; then
  # Don't take the API down over a rejected admin password: log why and keep serving.
  # Fix AP_ADMIN_* in the host's environment settings and redeploy to retry.
  if ! python manage.py create_ap_admin --no-input --if-missing; then
    echo "WARNING: first administrator NOT created (see the reason above). Update AP_ADMIN_PASSWORD and redeploy." >&2
  fi
fi
# OCR requests can take a while on small instances; keep workers few and the timeout generous.
exec gunicorn ap_backend.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120 \
  --access-logfile -
