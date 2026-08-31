# Development setup

## Prerequisites

- Git
- Node.js 22.x
- `pnpm` 11.22.0
- Python 3.12.x
- `uv` 0.12.7
- Docker Desktop or Docker Engine with Compose

Check the versions before the first install:

```bash
node --version
pnpm --version
python3 --version
uv --version
docker compose version
```

The analyzer requires Python 3.12. The repository includes `apps/analyzer/.python-version` so `uv` can select it when that interpreter is installed.

## First-time setup

Run these commands from the repository root:

```bash
pnpm install --frozen-lockfile
uv sync --locked --project apps/analyzer
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/analyzer/.env.example apps/analyzer/.env
```

Generate independent local values instead of sharing credentials with the team:

```bash
openssl rand -hex 32
```

Put values in the files as follows:

- Root `.env`: replace the PostgreSQL, Redis, and MinIO placeholders; set `ANALYZER_SERVICE_TOKEN` to a generated value.
- `apps/web/.env`: set the PostgreSQL password to the root value, set `BETTER_AUTH_SECRET` to a generated value, copy the same analyzer token, and use the local MinIO root user/password for the S3 credentials.
- `apps/analyzer/.env`: set the PostgreSQL and Redis passwords to the root values, copy the same analyzer token and MinIO credentials, and keep `localhost` URLs because `pnpm dev:analyzer` runs on the host.
- Compose injects container URLs and the same analyzer token when its optional `app` profile is used.
- `UPLOAD_TIMEOUT_MS` and `ANALYZER_REQUEST_TIMEOUT_MS` bound web intake and analyzer acceptance calls; keep them in `apps/web/.env`.

The root `.env` also contains the Phase 2 database and Better Auth values used by the Drizzle CLI and seed script. Keep `BETTER_AUTH_SECRET` consistent with `apps/web/.env`, and replace all synthetic seed password placeholders with local passwords of at least 12 characters. Do not commit either populated environment file.

Start and verify infrastructure:

```bash
pnpm infra:up
docker compose --env-file .env -f infra/compose.yaml ps
docker compose --env-file .env -f infra/compose.yaml ps --all minio-init
```

The `infra:up` script waits for healthy PostgreSQL, Redis, and MinIO containers and for the successful `minio-init` job. A successful `minio-init` job proves that the private `mailsentinel-evidence` bucket was created or already existed.

Apply the database schema and seed the synthetic identity data:

```bash
pnpm db:migrate
pnpm db:check
pnpm db:seed
```

The seed is idempotent and creates one demo organization with analyst and supervisor memberships. It intentionally creates no cases.

Generate the analyzer contract after changing its Pydantic API models:

```bash
pnpm contracts:generate
```

Start the applications in separate terminals. Run the worker separately when testing analyzer deferral:

```bash
pnpm dev:analyzer
pnpm --filter @mailsentinel/analyzer dev:worker
pnpm dev:web
```

Verify the analyzer after it starts:

```bash
curl --fail http://localhost:8000/health/live
curl --fail http://localhost:8000/health/ready
```

The browser communicates with Next.js only. The analyzer URL, service token, S3 credentials and object keys are server-only configuration. Uploads are raw bounded request bodies; the browser never receives a bucket URL.

## Daily commands

Start infrastructure:

```bash
pnpm infra:up
```

Stop infrastructure without deleting local data:

```bash
pnpm infra:down
```

Reset PostgreSQL, Redis, and MinIO state. This permanently deletes named volumes and requires typing `YES`:

```bash
pnpm infra:reset
```

View service status and logs:

```bash
docker compose --env-file .env -f infra/compose.yaml logs --follow postgres redis minio minio-init
```

Run all checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

If the Better Auth configuration changes, regenerate its reviewed Drizzle schema before generating an application migration:

```bash
BETTER_AUTH_SECRET="$(openssl rand -hex 32)" pnpm auth:schema:generate
pnpm db:generate
```

Review the generated schema and SQL before applying them. The command never applies a migration by itself.

Run browser checks after PostgreSQL has been migrated and seeded. Keep the analyzer worker stopped first to observe `queued`, then start it to observe the truthful `analysis_deferred` state:

```bash
pnpm --filter @mailsentinel/analyzer dev:worker
```

Run browser checks after PostgreSQL has been migrated and seeded:

```bash
pnpm test:e2e
```

The browser command reads `E2E_ANALYST_EMAIL` and `E2E_ANALYST_PASSWORD`, falling back to the corresponding synthetic seed variables when they are present in the process environment.

Run a single workspace check:

```bash
pnpm --filter @mailsentinel/web typecheck
pnpm --filter @mailsentinel/analyzer test
```

## Ports

| Service          | Port |
| ---------------- | ---: |
| Next.js web      | 3000 |
| FastAPI analyzer | 8000 |
| PostgreSQL       | 5432 |
| Redis            | 6379 |
| MinIO API        | 9000 |
| MinIO console    | 9001 |

All Compose ports bind to `127.0.0.1`. The MinIO console is a local administrator surface and must not be exposed publicly.

## Troubleshooting

- Port already in use: identify the process using 3000, 8000, 5432, 6379, 9000, or 9001 and stop it or choose a local alternative before changing the documented Compose contract.
- Docker daemon unavailable: start Docker Desktop or the Docker Engine and rerun `pnpm infra:up`.
- Stale local volumes: run `pnpm infra:reset` only when deleting local state is intentional.
- MinIO bucket initialization fails: inspect `docker compose --env-file .env -f infra/compose.yaml logs minio minio-init`, then rerun `pnpm infra:up` after MinIO is healthy.
- Python or `uv` mismatch: install Python 3.12 and `uv` 0.12.7, then rerun `uv sync --locked --project apps/analyzer`.
- Frozen lockfile mismatch: update the lockfile deliberately with the pinned toolchain; do not bypass `--frozen-lockfile` in CI or normal validation.
- Analyzer liveness passes while readiness fails: liveness only proves the process is running. Check PostgreSQL, Redis, and MinIO status, confirm the host URLs in `apps/analyzer/.env`, and inspect the dependency booleans in `/health/ready`.
- Missing or too-short secrets: generate new local values, update both application `.env` files, and ensure web, analyzer, and Compose share only `ANALYZER_SERVICE_TOKEN`.
- Database migration failure: inspect the generated SQL and PostgreSQL logs; do not replace migrations with runtime schema synchronization.
- Database seed failure: confirm the root `.env` contains `BETTER_AUTH_SECRET`, both synthetic seed passwords, and a reachable PostgreSQL URL. Existing users are not silently assigned new passwords.
- Sign-in failure after seeding: confirm the web and seed processes use the same database, the seed users are verified, and `BETTER_AUTH_SECRET` is at least 32 characters.

## Data safety

Use synthetic `.eml` data only during setup validation. The repository-provided `fixtures/synthetic/phase3-minimal.eml` is authored for this project, uses only `.test` addresses and contains no private data. Use `.test` email addresses for demo users. Do not commit populated environment files, paste secrets into issues or logs, upload real messages, or expose MinIO, PostgreSQL, Redis, or the analyzer publicly. Phase 3 preserves bytes and queues/defer analysis; it does not parse message content or produce verdicts.
