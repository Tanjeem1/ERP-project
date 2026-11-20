FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt
RUN addgroup --system --gid 1001 django \
    && adduser --system --uid 1001 --ingroup django django

COPY --chown=django:django backend /app
RUN mkdir -p /app/staticfiles /app/media && chmod +x /app/entrypoint.sh && chown -R django:django /app

USER django

ENTRYPOINT ["./entrypoint.sh"]
