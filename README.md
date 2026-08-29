# MailSentinel

MailSentinel is a polyglot monorepo for the MailSentinel product foundation. Product features remain deferred until the setup contract is healthy.

## Repository contents

- `apps/web`: the public Next.js web app
- `apps/analyzer`: the internal FastAPI analyzer service
- `packages/biome-config`: shared Biome configuration
- `packages/typescript-config`: shared TypeScript configuration
- `packages/ui`: shared React components
- `infra/`: local PostgreSQL, Redis, and MinIO Compose stack
- `docs/`: development setup and architecture decision records
- `.github/workflows/`: CI checks for both language workspaces

## First run

1. Install JavaScript dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```
2. Sync the locked analyzer environment:
   ```bash
   uv sync --locked --project apps/analyzer
   ```
3. Copy the ignored local environment files:
   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env
   cp apps/analyzer/.env.example apps/analyzer/.env
   ```
4. Replace local placeholders with generated values as described in `docs/development-setup.md`.
5. Start local infrastructure:
   ```bash
   pnpm infra:up
   ```
6. Start the analyzer and web app in separate terminals:
   ```bash
   pnpm dev:analyzer
   pnpm dev:web
   ```

Open `http://localhost:3000`. The analyzer health endpoints are available at `http://localhost:8000/health/live` and `http://localhost:8000/health/ready`.

## Root commands

- `pnpm dev` starts persistent development tasks through Turbo.
- `pnpm dev:web` starts only the web workspace.
- `pnpm dev:analyzer` starts only the analyzer workspace.
- `pnpm lint` runs JavaScript and Python lint checks.
- `pnpm typecheck` runs TypeScript and mypy checks.
- `pnpm test` runs Vitest and pytest checks.
- `pnpm build` builds the web workspace.
- `pnpm format:check` verifies supported formatting without changing files.
- `pnpm infra:down` stops infrastructure and preserves named volumes.
- `pnpm infra:reset` deletes local volumes after an explicit confirmation.

See `docs/development-setup.md` for prerequisites, environment setup, ports, health checks, and troubleshooting. `PLAN.md` and `SETUP_PLAN.md` define the product and setup boundaries.
