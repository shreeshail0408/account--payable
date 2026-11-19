#!/bin/sh
# Container entrypoint: apply migrations, create the first administrator if AP_ADMIN_PASSWORD is
# set and none exists yet, then serve with gunicorn on $PORT (Render sets it; defaults to 8000).
set -e
python manage.py migrate --noinput
if [ -n "${AP_ADMIN_PASSWORD:-}" ]; then
  python manage.py create_ap_admin --no-input --if-missing
fi
# OCR requests can take a while on small instances; keep workers few and the timeout generous.
exec gunicorn ap_backend.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120 \
  --access-logfile -
