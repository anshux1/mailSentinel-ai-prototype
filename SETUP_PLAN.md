# MailSentinel AI - Project Setup Plan

> This is the setup-only companion to `PLAN.md`. It establishes a reproducible development foundation for the MailSentinel AI prototype. Product features are intentionally deferred until this plan is complete.

## 1. Setup Outcome

At the end of this plan, a developer starting from a clean checkout will be able to:

1. Install the pinned JavaScript and Python toolchains.
2. Run the existing Next.js site from `apps/web`.
3. Run a minimal FastAPI analyzer service from `apps/analyzer`.
4. Start healthy local PostgreSQL, Redis and MinIO services with Docker Compose.
5. Configure local environment variables without committing secrets.
6. Run linting, type checks, tests and builds for both language workspaces through root commands.
7. Run the same foundational checks in GitHub Actions.
8. Understand which services are running, which ports they use and how to reset local state safely.

Setup is complete when the repository is ready for the first product slice: sign in -> upload -> store/hash -> queue -> parse -> persist -> display.

## 2. Current Repository Baseline

The repository currently contains a single Next.js application at the root:

- Next.js `16.3.2`.
- React `19.2.8`.
- TypeScript `5.x`.
- pnpm `11.22.0`, pinned by the root `packageManager` field.
- Application source under `src/`.
- Static assets under `public/`.
- Next.js, TypeScript, ESLint and PostCSS configuration at the root.
- A `pnpm-workspace.yaml` that currently contains pnpm build-approval settings but no workspace package globs.
- No `apps/`, `packages/`, `infra/` or Python analyzer workspace yet.

Before changing this structure, record the current results of:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

The baseline is evidence for the migration, not a new quality target. Any pre-existing failure must be documented before it is fixed or attributed to the migration.

## 3. Scope Boundary

### 3.1 Included in setup

- Repository and branch preparation.
- Migration of the current Next.js application into `apps/web`.
- Root pnpm workspace and Turborepo configuration.
- Shared JavaScript and Python command conventions.
- Minimal FastAPI application with liveness and readiness endpoints.
- Python dependency management with `uv`.
- Local PostgreSQL, Redis and MinIO infrastructure.
- Private local evidence bucket initialization.
- Environment variable examples and startup validation structure.
- Root ignore, editor, attributes and formatting policies.
- Foundational lint, type-check, unit-test and build commands.
- A CI workflow that validates the setup.
- Development setup documentation and architecture decision records.

### 3.2 Explicitly deferred

Do not implement these as part of setup:

- Better Auth configuration, sign-in pages or session handling.
- Drizzle schema, application migrations or demo-user seeding.
- Organization membership, RBAC or tenant-scoped repositories.
- Case creation, `.eml` upload, hashing workflow or audit events.
- Queue actors, parser logic, MIME limits or forensic extraction.
- DNS, GeoIP, RDAP or reputation integrations.
- Scoring, confidence calculation, ML models or campaign correlation.
- Case queue, case detail, maps, charts or report generation.
- Production deployment, managed services or public ingress.
- Neo4j, LLM integrations, Mailpit and optional stretch features.

The setup may define interfaces, configuration names and empty package boundaries needed by those features, but it must not pretend that those features are implemented.

## 4. Decisions to Freeze Before Editing

Record these decisions in `docs/adr/` before the migration. A decision may be revisited later, but the initial setup must not leave competing conventions in the repository.

### 4.1 Repository boundaries

- Keep one polyglot monorepo.
- Move the current Next.js application to `apps/web`.
- Keep the current documentation pages in `apps/web` for now. Do not create `apps/docs` until a second application needs the content.
- Reserve `apps/analyzer` for FastAPI and the Python worker.
- Keep reusable packages under `packages/`, but create a package only when it has a real consumer.
- Keep local infrastructure under `infra/`.

### 4.2 Runtime versions

- Node.js: `22.x` LTS.
- pnpm: `11.22.0`, matching `packageManager`.
- Python: `3.12.x`.
- `uv`: pin the version used by CI and document it in the setup guide.
- Preserve the installed Next.js and React versions during the migration.

### 4.3 Service choices

- Web runtime: Next.js with the App Router.
- Analyzer API: FastAPI with Pydantic settings.
- Queue: choose Dramatiq with Redis for the prototype, unless the team records a Celery decision before implementation begins.
- Database: PostgreSQL 17.
- Object storage: MinIO locally, with an S3-compatible abstraction.
- Cache/queue transport: Redis locally.
- Local provider mode: `fixture` or `offline`; no live provider calls during setup.

### 4.4 Communication rules

- The browser talks only to Next.js.
- FastAPI is an internal service and must not be exposed as a public browser API.
- The analyzer URL and service token are server-only values.
- PostgreSQL is the future metadata source of truth; Redis is never the source of truth.
- MinIO stores artifacts outside database rows and uses a private bucket.

## 5. Phase 0 - Prepare the Worktree

### Tasks

- [ ] Confirm that the working tree changes are understood before starting.
- [ ] Create a dedicated branch for the setup migration.
- [ ] Do not modify or replace the existing `PLAN.md`.
- [ ] Read the installed Next.js versioned documentation in `node_modules/next/dist/docs/` and any linked package guidance before changing Next.js configuration. If the installed package stores the guides elsewhere, locate and use that installed documentation instead of older online examples.
- [ ] Record Node, pnpm, Python, `uv`, Docker and Compose versions.
- [ ] Run and save the baseline lint and build result.
- [ ] Decide whether the baseline output belongs in `docs/` or the issue/PR description; do not commit generated logs containing local paths or secrets.

### Recommended checks

```bash
node --version
pnpm --version
python3 --version
uv --version
```

### Exit criteria

- The baseline application can still be identified and run.
- The migration branch has a known starting commit.
- Tool versions are compatible with the versions recorded in this document.

## 6. Phase 1 - Migrate the Web Application

Use `git mv` for tracked files so the application history is retained. Do not use a copy-and-delete migration unless a file genuinely needs to be recreated.

### 6.1 Files to move into `apps/web`

Move the current application-owned files and directories:

```text
src/                    -> apps/web/src/
public/                 -> apps/web/public/
next.config.ts          -> apps/web/next.config.ts
tsconfig.json           -> apps/web/tsconfig.json
eslint.config.mjs       -> apps/web/eslint.config.mjs
postcss.config.mjs      -> apps/web/postcss.config.mjs
components.json         -> apps/web/components.json
```

Move the existing root `package.json` to `apps/web/package.json`, then:

- Rename the package to `@mailsentinel/web`.
- Keep the current Next.js, React, UI and styling dependencies with the web package.
- Keep web-specific scripts such as `dev`, `build`, `start` and `lint`.
- Add a `typecheck` script using the installed TypeScript configuration.
- Add a test script only when the selected JavaScript test runner is installed and configured.
- Review all relative paths in the configuration after the move.

Do not move these root-owned files:

- `PLAN.md`.
- The new root `package.json` that will be created in Phase 2.
- The root lockfile, which must be regenerated from the workspace root.
- Root `.gitignore`, `.editorconfig`, `.gitattributes`, CI and documentation files.

`next-env.d.ts` is generated and ignored by Git. Let Next.js regenerate it under `apps/web` rather than relying on a manual move.

### 6.2 Web migration checks

- [ ] Verify the App Router still discovers `apps/web/src/app`.
- [ ] Verify the existing `/` and `/docs/[slug]` routes load.
- [ ] Verify path aliases still resolve from the moved `tsconfig.json`.
- [ ] Verify the existing Tailwind/PostCSS setup resolves from `apps/web`.
- [ ] Verify ESLint resolves its Next.js configuration from the new package location.
- [ ] Remove root-relative assumptions from scripts and configuration.
- [ ] Confirm no application code reads secrets from `NEXT_PUBLIC_*` accidentally.
- [ ] Run the web package directly before adding Turbo.

### 6.3 Web package command contract

`apps/web/package.json` must expose these commands to the root orchestrator:

| Script | Responsibility |
|---|---|
| `dev` | Start Next.js development mode on port 3000 |
| `build` | Produce the Next.js production build |
| `start` | Serve the production build |
| `lint` | Run ESLint for the web package |
| `typecheck` | Run TypeScript without emitting files |
| `test` | Run configured unit tests, once test tooling exists |

### Exit criteria

- The current site works from `apps/web`.
- The migration is represented as moves in Git wherever possible.
- No analyzer or product feature code has been introduced yet.

## 7. Phase 2 - Create the Root Workspace

### 7.1 Root `package.json`

Create a new private root `package.json` with:

- `private: true`.
- The repository package name, such as `mailsentinel`.
- `packageManager: "pnpm@11.22.0"`.
- An `engines.node` constraint for Node 22.
- Turbo as a root development dependency.
- Prettier as a root development dependency if `format` is provided by Prettier.
- Root scripts that delegate work to workspace packages.

Define at least these scripts:

| Script | Expected behavior |
|---|---|
| `dev` | Run persistent development tasks through Turbo |
| `dev:web` | Start only `@mailsentinel/web` |
| `dev:analyzer` | Start only the FastAPI service |
| `build` | Build all buildable workspaces |
| `lint` | Lint all JavaScript and Python workspaces |
| `typecheck` | Run TypeScript checks and mypy |
| `test` | Run JavaScript and Python tests |
| `format` | Format supported source files |
| `format:check` | Verify formatting without changing files |
| `clean` | Remove generated workspace outputs and Turbo cache |
| `infra:up` | Start local infrastructure from the documented Compose file |
| `infra:down` | Stop local infrastructure without deleting volumes |
| `infra:reset` | Explicitly delete local volumes and recreate clean state |

Root scripts should call `pnpm turbo` or `pnpm --filter`, not assume that commands are run from a package directory.

### 7.2 Workspace configuration

Update `pnpm-workspace.yaml` to preserve the existing pnpm build-approval configuration and add:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Do not add generated directories, `.next`, Python virtual environments or infrastructure data as workspace packages.

Regenerate the root lockfile from the root after the package move:

```bash
pnpm install
```

Use `pnpm install --frozen-lockfile` in all validation and CI steps after the lockfile is committed.

### 7.3 Turbo configuration

Create `turbo.json` with task behavior that reflects the two runtimes:

- `dev`: persistent and uncached.
- `build`: depends on dependency builds where applicable and caches `.next/**`, `dist/**` and other package build outputs.
- `lint`: cacheable and keyed by source/config changes.
- `typecheck`: cacheable and includes TypeScript, Python configuration and lockfile inputs.
- `test`: cacheable but invalidated by fixtures, source, test configuration and lockfiles.
- `format:check`: cacheable.
- `contracts:generate`: reserve the task name for the later OpenAPI client phase.
- `db:generate` and `db:migrate`: reserve the task names; migrations must never be treated as safely cacheable runtime mutations.

Include these in relevant task inputs:

- `package.json` and `pnpm-lock.yaml`.
- `pyproject.toml` and `uv.lock`.
- TypeScript, ESLint, Prettier, Ruff and mypy configuration.
- OpenAPI source files once the contract package exists.

Do not make the root `dev` task wait for a production build.

### 7.4 Package naming

Use a consistent private scope:

```text
@mailsentinel/web
@mailsentinel/analyzer
@mailsentinel/auth
@mailsentinel/contracts
@mailsentinel/db
@mailsentinel/ui
@mailsentinel/fixtures
```

Only `@mailsentinel/web` and `@mailsentinel/analyzer` are required for the setup milestone. Create the remaining packages when their first real implementation begins, with package metadata and a clear README rather than empty source exports.

### Exit criteria

- `pnpm-workspace.yaml` discovers both applications.
- Root commands delegate to the correct package scripts.
- The lockfile is generated from the workspace root and can be installed frozen.
- Turbo does not run Python through JavaScript tooling directly; it invokes the analyzer package scripts.

## 8. Phase 3 - Scaffold the Analyzer Workspace

### 8.1 Directory structure

Create only the setup foundation initially:

```text
apps/analyzer/
├── app/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── health.py
│   └── main.py
├── tests/
│   └── test_health.py
├── package.json
├── pyproject.toml
├── uv.lock
├── .python-version
├── .env.example
└── Dockerfile
```

Do not create parser, enrichment, scoring or reporting modules until the corresponding product phase starts.

### 8.2 Python environment

Initialize the workspace with Python 3.12 and `uv`:

- Add the Python version marker.
- Configure the project package and development dependency groups in `pyproject.toml`.
- Generate and commit `uv.lock`.
- Keep the virtual environment outside Git, normally at `apps/analyzer/.venv`.
- Use `uv run` in package scripts and CI so commands use the locked environment.

Setup dependencies should be limited to the service foundation:

- FastAPI.
- Uvicorn.
- Pydantic settings support.
- HTTP test support for health endpoint tests.
- pytest.
- Ruff.
- mypy.

Add database, object-storage, queue and forensic-parser dependencies when those implementations begin, unless the team needs them earlier to prove readiness checks. Every added dependency must have a reason and be captured in the lockfile.

### 8.3 Application entry point

Implement a minimal `app.main:app`:

- Expose `GET /health/live` to prove the process is running.
- Expose `GET /health/ready` to prove configured required dependencies are reachable when readiness checks are enabled.
- Return a small JSON response with service name, status and application version.
- Do not include environment secrets, connection strings or raw exception messages.
- Keep health endpoints independent of email content and future analysis logic.
- Make the port configurable, defaulting to `8000`.

Readiness behavior must be explicit:

- Liveness may pass while dependencies are down.
- Readiness should fail when required local dependencies cannot be reached.
- Provider APIs are not required for readiness; a provider outage must not make the analyzer unavailable.
- Use short connection timeouts and safe error codes.

### 8.4 Python package command contract

Create `apps/analyzer/package.json` as the Turbo bridge:

```json
{
  "name": "@mailsentinel/analyzer",
  "private": true,
  "scripts": {
    "dev": "uv run uvicorn app.main:app --reload --port 8000",
    "lint": "uv run ruff check . && uv run ruff format --check .",
    "typecheck": "uv run mypy app",
    "test": "uv run pytest",
    "dev:worker": "uv run python -m app.worker"
  }
}
```

The worker command may remain a documented placeholder until queue implementation starts, but it must not claim to process jobs during setup.

### 8.5 Python quality configuration

Configure `pyproject.toml` for:

- A single Ruff line length and target Python version.
- Ruff lint rules appropriate for a small typed service.
- pytest discovery under `tests/`.
- mypy source path and strictness appropriate for the initial health service.
- A test environment that does not require live provider credentials.

Add tests that cover:

- The application imports successfully.
- The liveness endpoint returns HTTP 200.
- The readiness endpoint returns a safe response when dependencies are available or unavailable.
- Configuration rejects malformed required values without printing secrets.

### Exit criteria

- `uv sync --locked` creates the analyzer environment.
- `pnpm --filter @mailsentinel/analyzer lint` passes.
- `pnpm --filter @mailsentinel/analyzer typecheck` passes.
- `pnpm --filter @mailsentinel/analyzer test` passes.
- `curl http://localhost:8000/health/live` returns a healthy response.

## 9. Phase 4 - Add Local Infrastructure

### 9.1 Compose file

Create `infra/compose.yaml` with these services:

| Service | Image role | Host port | Required now |
|---|---|---:|---|
| `postgres` | PostgreSQL 17 metadata database | 5432 | Yes |
| `redis` | Queue transport and temporary cache | 6379 | Yes |
| `minio` | S3-compatible evidence storage | 9000, 9001 | Yes |
| `minio-init` | Idempotent private bucket creation | none | Yes |
| `analyzer` | FastAPI service | 8000 | Optional profile |
| `worker` | Python worker process | none | Optional profile |

Do not add Mailpit unless the setup itself demonstrates email notifications.

### 9.2 Compose requirements

- Use named volumes for PostgreSQL, Redis and MinIO local persistence.
- Use one private Compose network for service-to-service traffic.
- Provide health checks for PostgreSQL, Redis and MinIO.
- Add dependency conditions so initialization does not race healthy services.
- Keep analyzer and worker behind an opt-in application profile while their implementation is incomplete.
- Use environment interpolation rather than hard-coded credentials in the Compose file.
- Use stable service names (`postgres`, `redis`, `minio`) for internal URLs.
- Bind local ports only to the developer machine.
- Do not publish the MinIO bucket as public.
- Do not mount the source tree into production-like containers unless needed for local reload.

### 9.3 PostgreSQL setup

- Use PostgreSQL 17.
- Define database name, user and password through local environment variables.
- Add a health check using `pg_isready`.
- Persist data in a named volume.
- Do not add application tables in this phase.
- Do not treat container startup as database migration success; migrations belong to the later data phase.

### 9.4 Redis setup

- Use Redis as temporary infrastructure only.
- Add a health check using a non-mutating ping.
- Configure a local password if the chosen image/configuration supports it without making development awkward.
- Document that queues and caches may be deleted during reset.
- Do not store evidence, verdicts or audit history in Redis.

### 9.5 MinIO setup

- Use separate local root credentials from any deployed credentials.
- Create the bucket `mailsentinel-evidence` through an idempotent initialization job.
- Keep the bucket private.
- Configure the local S3 endpoint, region and path-style behavior explicitly.
- Use the MinIO API on port `9000` and console on port `9001`.
- Document that the console is a local administrator surface and must not be exposed in deployment.
- Do not upload real email messages while validating setup.

### 9.6 Compose commands

Document and test these commands from the repository root:

```bash
docker compose --env-file .env -f infra/compose.yaml up -d postgres redis minio minio-init
docker compose --env-file .env -f infra/compose.yaml down
```

The reset command must be clearly destructive and require an explicit confirmation before removing named volumes. A normal `down` must preserve local state.

### Exit criteria

- A new developer can start PostgreSQL, Redis and MinIO with documented commands.
- All required services report healthy status.
- The private evidence bucket exists after initialization.
- Restarting Compose does not recreate or expose the bucket publicly.
- No real message or provider response is needed to validate infrastructure.

## 10. Phase 5 - Define Environment Configuration

### 10.1 Environment file policy

Create examples only; do not commit populated local files:

```text
.env.example
apps/web/.env.example
apps/analyzer/.env.example
```

The root `.env` is used for local Compose interpolation and is ignored by Git. Application processes may load their own environment according to their runtime conventions, but the setup guide must state which file is used for each command.

Every example must contain placeholders or safe local defaults only. Never put real API keys, authentication secrets, private email content or production bucket names in examples.

### 10.2 Root/Compose variables

Document local values for:

```dotenv
POSTGRES_DB=mailsentinel
POSTGRES_USER=mailsentinel
POSTGRES_PASSWORD=replace-with-local-secret
REDIS_PASSWORD=replace-with-local-secret
MINIO_ROOT_USER=replace-with-local-user
MINIO_ROOT_PASSWORD=replace-with-local-secret
S3_BUCKET=mailsentinel-evidence
```

Use one documented source of truth for Compose values so the service health checks and application URLs cannot silently disagree.

### 10.3 Web variables

Prepare the names required by the architecture, even though most consumers are implemented later:

```dotenv
DATABASE_URL=postgresql://mailsentinel:replace-me@localhost:5432/mailsentinel
BETTER_AUTH_SECRET=replace-with-at-least-32-random-bytes
BETTER_AUTH_URL=http://localhost:3000
ANALYZER_INTERNAL_URL=http://localhost:8000
ANALYZER_SERVICE_TOKEN=replace-with-local-service-token
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=mailsentinel-evidence
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=true
MAX_EML_BYTES=26214400
APP_ENV=development
```

### 10.4 Analyzer variables

Prepare the analyzer names from `PLAN.md`:

```dotenv
DATABASE_URL=postgresql://mailsentinel:replace-me@postgres:5432/mailsentinel
REDIS_URL=redis://:replace-me@redis:6379/0
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=mailsentinel-evidence
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=true
ANALYZER_SERVICE_TOKEN=replace-with-local-service-token
MAX_EML_BYTES=26214400
MAX_MIME_PARTS=200
MAX_HEADER_COUNT=1000
MAX_URLS=500
MAX_ATTACHMENT_BYTES=10485760
MAXMIND_DB_PATH=
ABUSEIPDB_API_KEY=
ENRICHMENT_MODE=fixture
ANALYSIS_VERSION=prototype-1
RETENTION_DAYS=90
```

### 10.5 Validation rules

Create the configuration modules that later features can extend:

- Web: a server-only environment parser with typed values and safe startup errors.
- Analyzer: a Pydantic settings object in `app/core/config.py`.
- Validate required secrets outside test mode.
- Enforce minimum lengths for authentication and service secrets.
- Validate URLs, ports, byte limits, modes and retention values.
- Reject unexpected secret variables prefixed with `NEXT_PUBLIC_`.
- Log enabled modes and service names, never values.
- Keep provider mode visibly distinguishable as `fixture`, `offline` or `live` once the UI exists.

For local development, generate random values rather than using shared team secrets:

```bash
openssl rand -hex 32
```

The setup documentation must explain where each generated value is placed and which services must share the internal analyzer token.

### Exit criteria

- A clean checkout can be configured using only the example files and locally generated values.
- Startup fails clearly when a required value is missing or malformed.
- No secret appears in source control, client bundles, logs or error responses.

## 11. Phase 6 - Establish Repository Quality Rules

### 11.1 `.gitignore`

Update the root ignore file to cover:

- `.env` and all populated environment files while allowing `.env.example`.
- `node_modules`, pnpm debug logs and package-manager caches.
- `.next`, `out`, `build`, `dist`, `.turbo` and coverage output.
- Python `.venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache` and Ruff cache.
- Local Compose volumes/data directories if any bind mounts are introduced.
- MinIO local data and temporary evidence files.
- Generated `next-env.d.ts` and TypeScript build metadata.
- Raw `.eml` samples, private messages, provider responses and local credentials unless explicitly stored under a reviewed synthetic fixture path.

Keep synthetic, reviewed fixtures trackable in the future. Do not use a broad ignore rule that makes the required fixture directory impossible to commit.

### 11.2 `.editorconfig` and `.gitattributes`

Create:

- `.editorconfig` with UTF-8, LF line endings, final newline and language-specific indentation.
- `.gitattributes` marking text files for normalization and preventing generated binaries from being treated as source.

Use ASCII for configuration and source unless a fixture or product requirement needs another encoding.

### 11.3 Formatting and linting

- Preserve the existing Next.js ESLint behavior after moving it into `apps/web`.
- Add shared ESLint configuration only when a second JavaScript package needs it.
- Add root Prettier configuration if `format` and `format:check` are provided.
- Add Python Ruff configuration in `apps/analyzer/pyproject.toml`.
- Make formatting checks deterministic in local development and CI.
- Do not run auto-formatting across unrelated existing files during the migration.

### 11.4 Type checking

- Keep TypeScript strictness from the current app unless the baseline proves it is not viable.
- Add a web `typecheck` script that does not emit build artifacts.
- Add analyzer mypy configuration and a `typecheck` script.
- Add root `pnpm typecheck` that runs both packages through Turbo.
- Do not weaken checks globally to hide migration errors; fix path and package boundary issues directly.

### 11.5 Test foundation

Set up only the test infrastructure needed to prove the repository foundation:

- Vitest for future TypeScript unit tests, if it is the selected runner.
- pytest for Python unit tests.
- A Python health/config smoke test.
- A minimal JavaScript configuration/import smoke test only if it provides value.
- Playwright configuration may be added with the first browser flow; it is not required to test an empty product shell.

Tests must use synthetic values and must not require live provider accounts.

### Exit criteria

- Formatting, linting and type checks are reproducible from a clean checkout.
- No generated or secret files are accidentally tracked.
- The setup smoke tests pass without external provider access.

## 12. Phase 7 - Add Container Definitions

### 12.1 Analyzer Dockerfile

Create `apps/analyzer/Dockerfile` with a small reproducible runtime image:

- Pin the base Python major/minor version to Python 3.12.
- Install dependencies from `uv.lock` rather than resolving unconstrained packages at image build time.
- Use a non-root runtime user.
- Set a working directory that matches the package layout.
- Do not copy `.env`, local evidence or private fixtures into the image.
- Expose port `8000` only for the API process.
- Define a health check against `/health/live`.
- Keep the worker as a separate command using the same image after worker code exists.

### 12.2 Web container decision

Do not add a web Dockerfile just to satisfy the directory diagram. First confirm the deployment target:

- If the web app uses a platform-native Next.js deployment, document that path and keep local development on the host.
- If the web app will run as a container, add a standalone-output Dockerfile in a separate deployment task and test it independently.

### Exit criteria

- The analyzer image builds without local secrets.
- The container runs as a non-root user.
- The health check reports liveness from the container network.

## 13. Phase 8 - Create CI Foundation

Create `.github/workflows/ci.yml` for pull requests and pushes to the default branch.

### Required workflow order

1. Check out the repository.
2. Set read-only repository permissions and a concurrency group.
3. Set up Node 22 and the pinned pnpm version.
4. Set up Python 3.12 and the pinned `uv` version.
5. Restore pnpm, uv and Turbo caches where supported.
6. Run `pnpm install --frozen-lockfile`.
7. Run `uv sync --locked` for `apps/analyzer`.
8. Validate the Compose configuration without publishing services.
9. Start PostgreSQL, Redis and MinIO when readiness or integration checks need them.
10. Run `pnpm lint`.
11. Run `pnpm typecheck`.
12. Run `pnpm test`.
13. Run `pnpm build`.
14. Build the analyzer container.
15. Upload only safe test/coverage artifacts when configured.

### CI rules

- CI must not need live provider API keys.
- CI must not connect to a demo or production bucket.
- Use synthetic database credentials and disposable service volumes.
- Fail if the lockfile is out of date.
- Fail if formatting, linting or type checking fails.
- Keep generated OpenAPI drift checks for the contract phase; do not add a fake contract check during setup.
- Do not print environment values in diagnostics.
- Pin action major versions and review action updates separately.

### Exit criteria

- A pull request runs the same foundational checks as a clean local checkout.
- The analyzer image builds in CI.
- CI can run without any private data or provider account.

## 14. Phase 9 - Document Developer Operations

Update the root `README.md` and add `docs/development-setup.md` with:

### Prerequisites

- Git.
- Node.js 22.
- pnpm 11.22.0.
- Python 3.12.
- `uv` at the documented version.
- Docker Desktop or Docker Engine with Compose.

### First-time setup

Document this order:

1. Clone the repository and enter its root.
2. Install JavaScript dependencies with the frozen lockfile.
3. Sync analyzer dependencies with `uv`.
4. Copy the environment examples to local ignored files.
5. Generate local secrets.
6. Start PostgreSQL, Redis, MinIO and the bucket initializer.
7. Verify service health.
8. Start the web app and analyzer separately.
9. Open the local web URL and analyzer health URL.

### Daily commands

Document the root commands for:

- Starting/stopping infrastructure.
- Running web and analyzer development processes.
- Running all checks.
- Running a single workspace check.
- Viewing service logs.
- Preserving or resetting local volumes.

### Ports

| Service | Port |
|---|---:|
| Next.js web | 3000 |
| FastAPI analyzer | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO console | 9001 |

### Troubleshooting

Include remedies for:

- Port already in use.
- Docker daemon unavailable.
- Stale Compose volumes.
- MinIO bucket initialization failure.
- `uv` or Python version mismatch.
- Frozen lockfile mismatch.
- Analyzer readiness failing while liveness passes.
- Missing or too-short local secrets.

### Data safety

State clearly that developers must use synthetic `.eml` data only, must not paste secrets into issue reports, and must not expose MinIO or analyzer services publicly.

## 15. Suggested File Tree After Setup

The following is the expected foundation, not a requirement to create empty feature modules:

```text
mailsentinel/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── eslint.config.mjs
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   └── .env.example
│   └── analyzer/
│       ├── app/
│       ├── tests/
│       ├── package.json
│       ├── pyproject.toml
│       ├── uv.lock
│       ├── .python-version
│       ├── Dockerfile
│       └── .env.example
├── docs/
│   ├── adr/
│   └── development-setup.md
├── infra/
│   ├── compose.yaml
│   └── scripts/
│       ├── up.sh
│       ├── down.sh
│       ├── reset.sh
│       └── wait-for-health.sh
├── .github/
│   └── workflows/
│       └── ci.yml
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── turbo.json
├── PLAN.md
└── SETUP_PLAN.md
```

## 16. Verification Sequence

Run these checks in order after implementation. A later check should not hide a failure from an earlier one.

### 16.1 Clean dependency installation

```bash
pnpm install --frozen-lockfile
cd apps/analyzer
uv sync --locked
cd ../..
```

The setup guide should provide an equivalent command that does not require changing directories manually for normal use.

### 16.2 Package checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Confirm that these commands invoke both the web and analyzer workspaces and that a Python failure is not silently ignored by a JavaScript-only command.

### 16.3 Infrastructure checks

```bash
pnpm infra:up
```

Verify:

- PostgreSQL accepts a local connection.
- Redis responds to ping.
- MinIO API is reachable.
- The evidence bucket exists and is private.
- No container reports an unhealthy state.

### 16.4 Application checks

Start the analyzer and web application through documented commands, then verify:

```bash
curl --fail http://localhost:8000/health/live
curl --fail http://localhost:8000/health/ready
```

Open `http://localhost:3000` and confirm the existing site loads from its new workspace location. Do not require case or authentication flows for this setup milestone.

### 16.5 Repeatability checks

- Stop and restart Compose without resetting volumes.
- Re-run bucket initialization and confirm it is idempotent.
- Run the checks a second time without changing source files.
- Run the setup from a clean checkout using only documented commands.
- Confirm `git diff --check` passes.
- Confirm no unexpected generated files or populated `.env` files are tracked.

## 17. Setup Acceptance Checklist

### Repository

- [ ] The current Next.js application lives in `apps/web`.
- [ ] The move preserves history where files were relocated.
- [ ] Root and package responsibilities are documented.
- [ ] `PLAN.md` remains unchanged.

### Tooling

- [ ] Node 22, pnpm 11.22.0, Python 3.12 and `uv` versions are documented and validated.
- [ ] JavaScript dependencies install with `pnpm install --frozen-lockfile`.
- [ ] Python dependencies install with `uv sync --locked`.
- [ ] Root scripts run through Turbo and package scripts.

### Web

- [ ] Existing routes load from `apps/web`.
- [ ] Web lint, typecheck and build pass.
- [ ] Server-only configuration boundaries are documented.

### Analyzer

- [ ] FastAPI imports and starts on port 8000.
- [ ] Liveness and readiness endpoints are available.
- [ ] Ruff, mypy and pytest pass.
- [ ] No forensic feature is falsely represented as implemented.

### Infrastructure

- [ ] PostgreSQL, Redis and MinIO start from one Compose file.
- [ ] Health checks and dependency conditions work.
- [ ] The private evidence bucket is initialized idempotently.
- [ ] Named volumes persist data across normal restarts.
- [ ] Reset behavior is explicit and documented.

### Configuration and security

- [ ] Example environment files contain no real secrets.
- [ ] Required configuration is validated at startup.
- [ ] Secrets are not exposed through `NEXT_PUBLIC_*`, logs or health responses.
- [ ] Local services are not configured for public access.
- [ ] Synthetic data is the only data used by setup verification.

### CI and documentation

- [ ] CI installs both dependency ecosystems from lockfiles.
- [ ] CI runs lint, typecheck, tests and builds.
- [ ] CI builds the analyzer image without private credentials.
- [ ] README and setup documentation cover first run, daily use, ports, troubleshooting and reset.
- [ ] ADRs record the monorepo, queue and local infrastructure decisions.

## 18. Handoff to Product Implementation

Only after every acceptance item passes should the team begin the next plan phases:

1. Add `packages/db` and reviewed Better Auth tables/migrations.
2. Add tenant and role foundations.
3. Add analyzer queue intake and worker lifecycle.
4. Add protected evidence upload and object hashing.
5. Add parser, extraction, enrichment and scoring stages.
6. Add dashboard, reporting and end-to-end flows.

The setup milestone must leave those phases with stable package boundaries, healthy dependencies, locked toolchains and documented commands. It should not mix infrastructure work with unfinished product behavior.
