# Analyzer

FastAPI intake service and Dramatiq worker for Phase 3 evidence ingestion.

The service accepts only authenticated internal `POST /v1/analyses` requests. It
validates the case/run/artifact relation in PostgreSQL, publishes one
`analysis_run_id`-identified job to Redis, and returns `202` without parsing
email content. The worker streams the private S3/MinIO object, verifies its
size and SHA-256, and then truthfully transitions the run to
`analysis_deferred` with `PARSER_NOT_AVAILABLE`; parsing is a Phase 4 concern.

## Local commands

```bash
uv sync --locked
uv run uvicorn app.main:app --reload --port 8000
uv run python -m app.worker
uv run pytest
uv run ruff check .
uv run mypy app
uv run python scripts/export_openapi.py
```

PostgreSQL, Redis and S3/MinIO are runtime dependencies for the intake and
worker. Imports and the test suite do not connect to those services; tests use
replaceable repository, queue and object-storage adapters.
