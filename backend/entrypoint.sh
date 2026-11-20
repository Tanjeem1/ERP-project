#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

python - <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

for url_key, default_host, default_port in (("DATABASE_URL", "pgbouncer", 5432), ("REDIS_URL", "redis", 6379)):
    parsed = urlparse(os.environ.get(url_key, ""))
    host = parsed.hostname or default_host
    port = parsed.port or default_port
    for attempt in range(60):
        try:
            with socket.create_connection((host, port), timeout=2):
                break
        except OSError:
            if attempt == 59:
                raise RuntimeError(f"Timed out connecting to {url_key} at {host}:{port}")
            time.sleep(1)
PY

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --worker-class gthread \
  --workers 4 \
  --threads 4 \
  --timeout 60 \
  --keep-alive 5 \
  --max-requests 2000 \
  --max-requests-jitter 200 \
  --access-logfile - \
  --error-logfile -
