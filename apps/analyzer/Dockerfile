# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:0.12.7-python3.12-slim AS uvimage

FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY --from=uvimage /usr/local/bin/uv /usr/local/bin/uv

RUN useradd --uid 10001 --create-home --home /home/app --shell /usr/sbin/nologin app

COPY apps/analyzer/pyproject.toml apps/analyzer/uv.lock apps/analyzer/.python-version /app/
COPY apps/analyzer/app /app/app
RUN uv sync --locked --no-dev --no-install-project --no-cache

RUN chown -R app:app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "python -c \"import os,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:' + os.getenv('ANALYZER_PORT', '8000') + '/health/live', timeout=3); raise SystemExit(0 if r.status == 200 else 1)\""]

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${ANALYZER_PORT:-8000}\""]
