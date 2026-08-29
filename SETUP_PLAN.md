# MailSentinel AI - Phase 2 Implementation Plan

> This file replaces the completed setup plan. It is intentionally scoped to Phase 2 of `PLAN.md`: data, authentication and the case shell. It is not a second master plan.

> **Phase goal:** an authenticated analyst can enter the application, the server can resolve the analyst's organization and role, and every case read is tenant-scoped even though case creation is still deferred.

> **Guiding rule:** authorization is decided on the server from the session and database membership. The browser may request a resource, but it never proves which organization it may access.

## 1. Phase Contract

### 1.1 Upstream scope

This plan implements only the following items from `PLAN.md` Phase 2:

- [ ] Implement Drizzle schema and migrations.
- [ ] Configure Better Auth using the installed-version documentation.
- [ ] Add organization membership and roles.
- [ ] Seed demo users and one organization.
- [ ] Implement tenant-scoped repositories.
- [ ] Build the sign-in and dashboard shell.
- [ ] Build the empty case queue and case detail routes.
- [ ] Add authorization and tenant-isolation tests.

The Phase 2 deliverable is:

> Authenticated users see only authorized case data, and the application has a stable data/auth boundary for the evidence-ingestion phase.

### 1.2 Required outcome

At the end of this phase:

1. A clean database can be created using committed migrations.
2. Better Auth stores and validates email/password sessions in PostgreSQL.
3. A seeded analyst and supervisor can sign in and sign out.
4. A signed-in request resolves a user, one active demo organization, and one application role.
5. Viewer, analyst, supervisor and admin permissions are represented explicitly.
6. `/dashboard`, `/cases` and `/cases/[caseId]` are protected server-side.
7. The case queue has a truthful empty state because ingestion does not exist yet.
8. A case ID from another organization is indistinguishable from a missing case at the web boundary.
9. Tests prove authentication, role policy, migration behavior and horizontal tenant isolation.
10. Phase 3 can add upload, artifacts, analysis runs and queue work without replacing the identity or repository layer.

### 1.3 Phase boundaries

Do not implement these items in this phase:

- Raw `.eml` upload or upload progress.
- SHA-256 ingestion or object-storage writes.
- Evidence artifacts, attachment storage or chain-of-custody events.
- FastAPI intake, Dramatiq actors or worker processing.
- MIME parsing, extraction, enrichment or scoring.
- Case creation UI or a fake upload button that does not work.
- Case analysis status transitions beyond defining the future case status type.
- Provider integrations, fixtures, maps, reports or audit screens.
- Organization invitations, organization switching, teams or member-management UI.
- Social login, public sign-up, email delivery or password reset.
- LLM, ML, Neo4j or production deployment work.

The database may define the minimum future `cases` columns needed by the case shell, but no Phase 2 code may claim that evidence or analysis exists.

## 2. Starting Point

### 2.1 Existing foundation

The completed setup currently provides:

- A pnpm/Turbo monorepo rooted at `/Users/anshu/sih/prototype`.
- The Next.js application in `apps/web` as `@mailsentinel/web`.
- The FastAPI application in `apps/analyzer` as `@mailsentinel/analyzer`.
- Locked JavaScript and Python dependency files.
- Shared UI, TypeScript and Biome packages under `packages/`.
- PostgreSQL, Redis and MinIO Compose services under `infra/compose.yaml`.
- Server-side web environment parsing in `apps/web/src/server/env.ts`.
- Analyzer health endpoints and setup-only worker placeholder.
- Local setup documentation and foundational CI.

### 2.2 Existing conventions to preserve

- Use the `@mailsentinel/*` package scope.
- Preserve the current Biome and Prettier conventions; do not introduce a second formatter.
- Keep PostgreSQL as the canonical metadata store.
- Keep Redis out of the authentication session path for now.
- Keep all analyzer URLs and service credentials server-only.
- Follow the installed Next.js 16 guides in `node_modules/next/dist/docs/` before adding route, proxy, server-action or dynamic-segment code.
- Follow the installed Better Auth documentation and generated schema output rather than copying an older example.
- Do not modify `PLAN.md`; it is the source plan and already has worktree changes that are outside this phase document.

### 2.3 Missing implementation

The following are not present and are the primary outputs of this plan:

- `packages/db`.
- `packages/auth`.
- A Drizzle configuration and application migrations.
- Better Auth as a runtime dependency.
- The Better Auth route handler and client.
- Organization and membership records.
- Tenant-scoped case repositories.
- Sign-in, protected layout, dashboard and case routes.
- Database, auth and browser security tests for this phase.

### 2.4 Preflight

Run these checks before editing implementation code. Record failures as pre-existing or phase-related; do not hide them by weakening configuration.

```bash
pnpm install --frozen-lockfile
uv sync --locked --project apps/analyzer
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm infra:up
```

Confirm that PostgreSQL is reachable using the local connection string in `apps/web/.env`, but do not apply application migrations until the schema workstream is ready.

## 3. Decisions To Freeze

Record the decisions below in `docs/adr/0004-data-auth-and-tenant-rbac.md` before implementation. If a decision changes, update the ADR and this file before writing code that depends on it.

| Area | Phase 2 decision | Reason |
|---|---|---|
| Database driver | `pg` with `drizzle-orm/node-postgres` | A conventional pooled PostgreSQL driver works in the Node runtime and is supported by the Better Auth Drizzle adapter. |
| Better Auth adapter | Use the current official `@better-auth/drizzle-adapter` package after checking the installed docs | The adapter package and import path have changed across Better Auth releases. |
| Identity schema | Generate Better Auth core tables from the installed version and review the generated output | Auth tables must match the exact installed version and enabled options. |
| Application tenancy | App-owned `organizations` and `organization_members` tables | The prototype needs exact application roles and server-side tenant queries, not organization-management endpoints. |
| Organization plugin | Do not enable Better Auth's `organization()` plugin in Phase 2 | Avoid duplicate membership sources and the plugin's owner/admin/member semantics until invitations or org switching are actually required. |
| RBAC | Explicit application policy for `viewer`, `analyst`, `supervisor` and `admin` | Case permissions are application permissions and must not depend on UI state or Better Auth default roles. |
| Session storage | PostgreSQL-backed Better Auth sessions; no Redis secondary storage and no cookie cache initially | Revocation and identity metadata remain easy to inspect, and PostgreSQL stays the source of truth. |
| Sign-up | Disable public email/password sign-up in the mounted auth configuration | Demo accounts are seeded; an open registration path is not required. |
| Email flows | No verification email or reset email in this phase; seed accounts are verified through a documented server-side path | Mail delivery is outside the setup and Phase 2 scope. Revisit before any external user access. |
| Active organization | Resolve the sole demo membership server-side; do not accept an organization ID from the browser as authority | The prototype has one organization and does not need an organization switcher yet. |
| Case API | Use server components and server repositories for the read-only shell; add public case APIs with the ingestion phase | Avoid building a duplicate transport contract before case data has behavior. |
| IDs | Use opaque text IDs for application tables, with a stable prefix where useful; never use sequential IDs exposed to the browser | Case and organization identifiers will appear in URLs and logs. |

### 3.1 Organization plugin contingency

If the team decides that Better Auth's organization plugin is required, stop before creating migrations. Do not add the plugin alongside the app-owned membership table. Instead:

1. Revisit the ADR and choose one membership source.
2. Generate the plugin schema with the installed Better Auth CLI.
3. Map the plugin's schema names and fields deliberately if the application still requires `organizations` and `organization_members`.
4. Define custom roles with the current access-control API, including all built-in permissions needed by enabled plugin endpoints.
5. Add plugin schema and role behavior to the migration and security tests.

## 4. Target Boundaries

### 4.1 Package responsibilities

`@mailsentinel/db` owns:

- PostgreSQL pool and Drizzle instance.
- Generated Better Auth schema import.
- Application schema for organizations, memberships and the case shell.
- Drizzle configuration and migration files.
- Seed and test database helpers.
- Tenant-scoped repository functions.

`@mailsentinel/auth` owns:

- Better Auth server construction.
- Better Auth client construction.
- Session type exports.
- Application role and permission definitions.
- Session-to-organization context helpers that depend on the database.

`@mailsentinel/web` owns:

- Next.js route handlers and pages.
- Sign-in form and navigation shell.
- Server-page authorization boundaries.
- User-facing error, loading and empty states.

`apps/analyzer` remains unchanged except for configuration or health-test adjustments needed by the root checks. It must not receive queue or forensic code in Phase 2.

### 4.2 Dependency direction

Use this direction and reject imports that point the other way:

```text
apps/web -> @mailsentinel/auth -> @mailsentinel/db
apps/web -> @mailsentinel/ui
@mailsentinel/auth -> better-auth
@mailsentinel/db -> drizzle-orm, pg
```

The database package must not import from `apps/web`. The auth package must not import page components. Client bundles must never import the server auth instance or database pool.

`@mailsentinel/db` must expose a small structural tenant-scope type, such as `TenantScope = { organizationId: string }`, rather than importing a workspace-context type from `@mailsentinel/auth`. The auth package may resolve a richer `WorkspaceContext`, but web code must adapt it to the database-owned tenant scope when calling repositories. This keeps the dependency direction acyclic.

### 4.3 Request authorization flow

Every protected server page follows this conceptual flow:

```text
request
  -> read Better Auth session from request headers
  -> reject or redirect when there is no valid session
  -> resolve the user's organization membership from PostgreSQL
  -> resolve the explicit application role
  -> authorize the requested operation
  -> execute a repository query containing the resolved organization ID
  -> return a minimized display projection
```

No step may use an organization ID supplied only by a query string, hidden form field, client store or React prop as proof of access.

## 5. Database Design

### 5.1 Package layout

Create the following shape. Do not add empty parser, enrichment or report directories to this package.

```text
packages/db/
├── src/
│   ├── client.ts
│   ├── env.ts
│   ├── schema/
│   │   ├── auth.ts              # Generated by Better Auth CLI; review, do not hand-edit
│   │   ├── tenancy.ts
│   │   ├── cases.ts
│   │   └── index.ts
│   ├── repositories/
│   │   ├── organizations.ts
│   │   ├── memberships.ts
│   │   └── cases.ts
│   ├── test-utils.ts
│   └── index.ts
├── drizzle/
├── drizzle.config.ts
├── seed.ts
├── package.json
└── README.md
```

The exact generated auth schema filename may differ if the installed CLI requires another location. Keep the generated file inside `packages/db/src/schema/` and expose it through `schema/index.ts`.

### 5.2 Better Auth tables

Generate the core schema for the exact Better Auth version and configuration. At minimum, review:

- `user`.
- `session`.
- `account`.
- `verification`.

Rules:

- Do not hand-design Better Auth tables from memory.
- Do not edit generated auth schema to make it look like the application schema.
- Do not add the organization plugin tables while the plugin is disabled.
- Do not configure Redis secondary storage because that changes where sessions and verification records live.
- Verify the generated schema includes the fields required by email/password sessions and the installed Better Auth release.
- Keep the generated logical field names expected by Better Auth; map SQL column names only after reviewing the adapter's current field-mapping rules.

### 5.3 `organizations`

This is an application table, not a Better Auth table.

| Column | Type/rule | Purpose |
|---|---|---|
| `id` | opaque text primary key | Tenant identifier. |
| `name` | bounded non-empty text | Display name. |
| `slug` | bounded text, unique | Stable internal/display slug. |
| `created_at` | `timestamptz`, default current time | Creation time in UTC. |

Do not store message content, credentials or provider data here.

### 5.4 `organization_members`

| Column | Type/rule | Purpose |
|---|---|---|
| `id` | opaque text primary key | Membership record identifier. |
| `organization_id` | non-null foreign key to `organizations.id` | Tenant owner. |
| `user_id` | non-null foreign key to the Better Auth user table | Authenticated principal. |
| `role` | checked text or PostgreSQL enum | `viewer`, `analyst`, `supervisor` or `admin`. |
| `created_at` | `timestamptz`, default current time | Membership creation time. |

Constraints and indexes:

- Unique `(organization_id, user_id)`.
- Index `(user_id)` for session-to-membership resolution.
- Index `(organization_id, role)` for future administrative views.
- Foreign keys use deliberate deletion behavior; do not allow a user deletion to orphan a membership.
- A membership role is always one of the four application roles. Unknown roles fail closed.
- Membership changes are not exposed through a Phase 2 UI.

### 5.5 `cases` shell table

Create the minimum case table required by the empty queue, detail route and future ingestion work. It is metadata only in this phase.

| Column | Type/rule | Purpose |
|---|---|---|
| `id` | opaque text primary key | Case identifier used by URLs and repositories. |
| `organization_id` | non-null foreign key to `organizations.id` | Tenant owner. |
| `case_number` | bounded text, unique per organization | Human-readable case reference. |
| `title` | bounded text | Safe display title. |
| `status` | checked text or enum | Future lifecycle state; no Phase 2 worker writes it. |
| `priority` | checked text or enum | `low`, `normal`, `high` or `critical`. |
| `submitted_by` | nullable foreign key to Better Auth user | Future uploader identity. |
| `original_filename` | nullable bounded text | Future sanitized filename; no upload writes it yet. |
| `message_received_at` | nullable `timestamptz` | Future message date from the email. |
| `created_at` | `timestamptz`, default current time | Case creation time. |
| `updated_at` | `timestamptz`, default current time | Metadata update time. |
| `retention_until` | `timestamptz` | Future retention deadline. |
| `legal_hold` | boolean, default false | Future deletion protection. |

Define the future status values from `PLAN.md` in one source of truth:

```text
queued
parsing
extracting
enriching
scoring
completed
parse_failed
analysis_deferred
enrichment_partial
failed
```

The Phase 2 UI may render these values for synthetic repository tests, but the product seed must contain no cases and no fake analysis results.

Indexes and constraints:

- Unique `(organization_id, case_number)`.
- Index `(organization_id, created_at desc)` for the queue.
- Index `(organization_id, status, created_at desc)` for future filters.
- Index `(organization_id, priority, created_at desc)` for future queue views.
- Check `legal_hold` is never nullable.
- Check `retention_until` is not earlier than `created_at` when the database can enforce it without blocking future imports.
- Do not add evidence, hash, artifact, verdict or observation columns to this table.

### 5.6 Future tables intentionally deferred

Do not create these tables in Phase 2 unless a migration dependency proves that the exact table is required by the chosen Better Auth version:

- `evidence_artifacts`.
- `analysis_runs`.
- `verdicts`.
- `evidence_observations`.
- `indicators` and `case_indicators`.
- `relay_hops`.
- `attachments`.
- `provider_observations`.
- `audit_events`.

Phase 3 owns evidence, analysis-run and audit table design. This keeps the migration reviewable and prevents unimplemented data from looking complete.

## 6. Migration Workflow

### 6.1 Install dependencies

Add only dependencies needed for this phase:

- `better-auth` at a version pinned for the project.
- The matching Better Auth Drizzle adapter package.
- `drizzle-orm`.
- `drizzle-kit` as a development dependency.
- `pg` and its TypeScript types.
- Any exact Better Auth CLI package required by the installed release.
- A test runner dependency in `@mailsentinel/db` only if the package owns database tests.

Do not install Redis auth storage, organization-plugin packages, OAuth provider SDKs or upload libraries for this phase.

### 6.2 Generate and review the auth schema

Before running the CLI:

1. Read the installed Better Auth docs and package version.
2. Create the server config with only the Phase 2 features enabled.
3. Confirm the CLI can load the config without connecting to a production database.
4. Run the installed CLI help command and use its current `generate` syntax.
5. Generate the Drizzle schema into `packages/db/src/schema/auth.ts` or the documented equivalent.
6. Review every generated table and column.
7. Re-run generation after any auth option or plugin change.

The current Better Auth documentation uses commands similar to the following. Treat this as a shape, not a command to copy blindly:

```bash
pnpm dlx auth@<resolved-version> generate \
  --config ./packages/auth/src/server.ts \
  --adapter drizzle \
  --dialect postgresql \
  --output ./packages/db/src/schema/auth.ts
```

Use the exact `--dialect` value and output behavior reported by the installed CLI. Pin the resolved version in the package/tooling documentation; do not use an unpinned `latest` command in CI.

### 6.3 Combine schemas

`packages/db/src/schema/index.ts` must export the generated auth schema and application schema from one import surface for Drizzle Kit and the runtime client.

Requirements:

- No duplicate table declarations.
- Explicit relations for application tables where Drizzle needs them.
- Foreign keys target the actual generated Better Auth user table.
- The Drizzle runtime receives the complete schema needed by repositories and the Better Auth adapter.
- The Better Auth adapter receives the schema/model mapping required by the installed release.
- Do not enable Drizzle joins until the generated and application relations have been reviewed; joins are not needed for the first case shell.

### 6.4 Generate application migrations

Configure `packages/db/drizzle.config.ts` for PostgreSQL, the combined schema and a committed migration directory. Use the existing database environment source without importing web application modules into the database package.

Add package/root commands with these responsibilities:

| Command | Responsibility |
|---|---|
| `db:generate` | Generate a migration from reviewed schema changes. |
| `db:migrate` | Apply committed migrations; never silently push schema. |
| `db:seed` | Idempotently create synthetic demo identity and tenancy data. |
| `db:check` | Verify the configured database connection and expected tables. |

Workflow:

```bash
pnpm --filter @mailsentinel/db db:generate
pnpm --filter @mailsentinel/db db:migrate
pnpm --filter @mailsentinel/db db:seed
```

Review generated SQL before applying it. Do not use `drizzle-kit push` as the repository migration workflow. Do not edit an already-applied migration; create a follow-up migration.

### 6.5 Migration acceptance

- A clean PostgreSQL volume can be migrated from zero.
- Running migrations a second time is a no-op.
- Generated Better Auth tables match the installed configuration.
- Application tables have tenant foreign keys and expected constraints.
- Migration failure does not leave a misleading success marker.
- The root `db:migrate` task is uncached and is never run implicitly by a page request or build.

## 7. Better Auth Implementation

### 7.1 Server package files

Create the following, adjusting names only if the installed package conventions require it:

```text
packages/auth/
├── src/
│   ├── env.ts
│   ├── permissions.ts
│   ├── server.ts
│   ├── client.ts
│   ├── context.ts
│   └── index.ts
├── package.json
└── README.md
```

`server.ts` must be server-only and export the single mounted Better Auth instance. `client.ts` must export only the browser-safe auth client. Do not export the database pool from the auth package.

### 7.2 Server configuration requirements

Build the server config from the current Better Auth API and the generated schema. It must:

- Set an explicit application name.
- Use the PostgreSQL Drizzle adapter.
- Enable email/password authentication.
- Disable public sign-up in the mounted runtime instance.
- Use a minimum password length of at least 12 for any seed-only creation path.
- Keep the maximum password length within the installed Better Auth limits.
- Use a fixed, validated `BETTER_AUTH_URL`.
- Configure the local and deployed trusted origins explicitly.
- Keep CSRF and origin checks enabled.
- Keep HTTP-only, same-site cookies; use secure cookies in production.
- Use PostgreSQL-backed sessions with an explicit expiration and refresh policy.
- Keep auth rate limiting enabled; set a stricter sign-in rule after checking the installed option names.
- Avoid cookie cache until its revocation tradeoff is reviewed.
- Add `nextCookies()` when using server actions or server-side Better Auth calls, and keep it last in the plugin list as required by the current Next.js integration guide.
- Avoid OAuth, organization, admin, two-factor and password-reset plugins in this phase.
- Use Better Auth's default password hashing unless a documented requirement justifies a reviewed replacement.
- Configure logging so auth errors never include passwords, tokens, raw request bodies or full database URLs.

Do not hard-code secrets in `server.ts`. The package may have its own small environment parser, but it must not import `apps/web/src/server/env.ts` because that would invert the package boundary. If validation logic is shared later, extract it into a real shared package rather than importing across apps.

### 7.3 Seed-only user creation

The mounted runtime must not expose sign-up, but the seed needs a safe way to create users with Better Auth's password hashing.

Use this order of preference after checking the installed release:

1. Use the documented server-side user-creation API that hashes passwords and allows a verified user to be created.
2. If that API is only available through a plugin that is not otherwise required, create a seed-only auth instance or script that is never mounted as an HTTP handler.
3. If a seed-only `signUpEmail` path is used, set `autoSignIn` off, mark the user verified through the documented server-side method, and ensure the public instance still has sign-up disabled.

Never insert a plaintext password or hand-construct a Better Auth account hash. Never log seed passwords. The chosen method and the exact Better Auth version must be recorded in `packages/db/README.md`.

### 7.4 Client configuration

Create a browser-safe client using the current React/Next.js Better Auth client import. It must:

- Use same-origin requests to the mounted `/api/auth` route.
- Export sign-in and sign-out methods needed by the UI.
- Not contain `BETTER_AUTH_SECRET`, database URLs, service tokens or storage credentials.
- Not be used as the authority for protected page rendering.
- Redirect only to fixed local application paths after a successful sign-in; do not accept arbitrary callback URLs from form input.

### 7.5 Next.js route handler

Add:

```text
apps/web/src/app/api/auth/[...all]/route.ts
```

Mount the Better Auth handler using the current Next.js integration, normally `toNextJsHandler(auth)`, and export only the supported `GET` and `POST` handlers.

Verify:

- Auth requests are same-origin and receive cookies.
- `GET /api/auth/ok` works if that endpoint exists in the installed release.
- Sign-in sets an HTTP-only session cookie.
- Sign-out invalidates the session.
- Unsupported methods do not expose stack traces.
- Route errors do not include secrets or raw database errors.

### 7.6 Session context

Implement `getSessionContext()` on the server. It must:

1. Read request headers using the current Next.js async API.
2. Call Better Auth's server `getSession` API.
3. Return an unauthenticated result without leaking whether a user exists.
4. Query `organization_members` by the authenticated Better Auth user ID.
5. Resolve the sole demo organization membership deterministically.
6. Fail closed when there is no membership or when multiple memberships appear before organization switching exists.
7. Return a typed context containing only the user summary, organization summary and role needed by server code.

Do not place the full session, password account data, session token or database row in a client component prop.

## 8. Authorization and Repositories

### 8.1 Permission model

Define role and permission types in `packages/auth/src/permissions.ts` or another package-owned module. Use explicit sets, not numeric role comparisons.

Required role semantics:

| Permission | Viewer | Analyst | Supervisor | Admin |
|---|:---:|:---:|:---:|:---:|
| `case.read` | Yes | Yes | Yes | Yes |
| `case.create` | No | Yes | Yes | Yes |
| `analysis.retry` | No | Yes | Yes | Yes |
| `note.create` | No | Yes | Yes | Yes |
| `report.export` | No | No | Yes | Yes |
| `disposition.override` | No | No | Yes | Yes |
| `audit.read` | No | No | Yes | Yes |
| `member.manage` | No | No | No | Yes |
| `settings.manage` | No | No | No | Yes |

Only `case.read` is exercised by the Phase 2 pages. Defining the full matrix now prevents later routes from inventing inconsistent checks.

Policy requirements:

- Unknown role or permission fails closed.
- The policy has unit tests for every matrix cell.
- The client may use the same types for visual affordances, but server checks remain authoritative.
- A role label is not a permission check.
- Do not accept a role from a request body, URL, cookie or client state.

### 8.2 Server guards

Implement small composable guards:

- `requireSession()` returns a valid authenticated user or redirects to `/sign-in` for page requests.
- `requireWorkspaceContext()` returns user, organization and role or gives a safe denial.
- `requirePermission(permission)` checks the resolved role before invoking a protected operation.
- `getOptionalSession()` supports the sign-in page and root redirect without throwing.

Use the current Next.js 16 conventions for `redirect`, `notFound` and any `forbidden` helper. Do not rely on a proxy/middleware cookie-presence check as the only protection. If a `src/proxy.ts` file is added for early redirects, repeat the full session and tenant checks in every page and route handler.

### 8.3 Repository API

Repositories must accept a trusted database-owned tenant scope, not a raw organization ID from a browser request. The scope may be derived from the richer auth context, but `@mailsentinel/db` must not import `@mailsentinel/auth`.

Recommended shapes:

```text
listCases(scope, filters)
getCase(scope, caseId)
getMembershipForUser(userId)
getOrganizationById(scope.organizationId)
```

Repository rules:

- Every tenant-owned query includes `organization_id = scope.organizationId`.
- `getCase` applies the tenant predicate in the same query as the case ID predicate.
- `listCases` never returns another organization's counts, rows or pagination metadata.
- Case projections contain only safe metadata needed by the shell.
- No repository has an unscoped `getCaseById` export available to web code.
- A missing membership is not converted into a default organization.
- No repository trusts an `organizationId` passed by a client.
- Use parameterized Drizzle expressions only; do not concatenate SQL or identifiers from requests.
- Return `null` for inaccessible/missing case details so the route can render one not-found outcome.
- Keep write methods out of the Phase 2 repository surface except seed/test helpers.

### 8.4 Case number and ID rules

Phase 2 does not create cases, but define the future rules now:

- IDs are opaque and generated server-side.
- Case numbers are human-readable but unique only within an organization.
- Case numbers are never used as authorization keys without a tenant predicate.
- Subject, sender and filenames are not used in IDs or object keys.
- No sequential database ID is exposed as a public case identifier.

## 9. Seed and Local Data

### 9.1 Seed contents

The idempotent local seed creates:

- One synthetic organization, for example `demo-security-lab`.
- One verified analyst user.
- One verified supervisor user.
- One analyst membership.
- One supervisor membership.
- No cases, artifacts, reports or audit rows.

Test factories may create a second organization and synthetic cases in an isolated test database. Those records must never be part of the normal demo seed.

### 9.2 Seed inputs

Add ignored local seed variables only if the implementation needs them:

```dotenv
SEED_ORGANIZATION_NAME=MailSentinel Demo Lab
SEED_ORGANIZATION_SLUG=demo-security-lab
SEED_ANALYST_EMAIL=analyst@example.test
SEED_ANALYST_PASSWORD=replace-with-local-demo-password
SEED_SUPERVISOR_EMAIL=supervisor@example.test
SEED_SUPERVISOR_PASSWORD=replace-with-local-demo-password
```

Rules:

- Use `.test` domains or another clearly synthetic namespace.
- Require passwords to be supplied locally; do not commit defaults that can be used to access a deployed environment.
- Enforce the password policy before calling Better Auth.
- Never print passwords, password hashes, session tokens or full connection strings.
- Never use real personal emails or production credentials.
- Do not include seed passwords in README examples, CI output or screenshots.

### 9.3 Idempotency behavior

Run the seed inside deliberate transactions where possible:

1. Validate all seed configuration before opening a write transaction.
2. Upsert the organization by its synthetic slug.
3. Find each user by exact synthetic email.
4. Create missing users through the documented Better Auth server-side path.
5. Verify existing seed users have the expected verified state; do not silently reset an unknown user's password.
6. Upsert memberships by `(organization_id, user_id)`.
7. Fail loudly if a configured demo email belongs to an unexpected tenant or role state.
8. Commit only after all required users and memberships exist.

Run the seed twice and confirm that it does not create duplicate users, organizations or memberships.

## 10. Web Route and UI Plan

### 10.1 Route tree

Use route groups only for organization; keep public URLs exactly as required by `PLAN.md`:

```text
apps/web/src/app/
├── page.tsx
├── (auth)/
│   ├── sign-in/
│   │   └── page.tsx
│   └── session-expired/
│       └── page.tsx
├── (protected)/
│   ├── layout.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   └── cases/
│       ├── page.tsx
│       └── [caseId]/
│           └── page.tsx
└── api/
    └── auth/
        └── [...all]/
            └── route.ts
```

Confirm the installed Next.js route-segment and async-params conventions before implementing dynamic pages.

### 10.2 Root behavior

Replace the setup placeholder at `/` with a server-side redirect:

- Valid session and membership -> `/dashboard`.
- No valid session -> `/sign-in`.
- Valid session without membership -> safe access-denied state, not a fabricated organization.

Do not render a public dashboard preview that accidentally reveals case counts.

### 10.3 Sign-in page

Implement a focused email/password page using existing UI primitives where they provide real value.

Required behavior:

- Email and password fields with labels, autocomplete attributes and keyboard support.
- Submit loading state and disabled duplicate submission.
- Client-side required-field validation for fast feedback.
- Call Better Auth's email sign-in method through the browser-safe client.
- On success, navigate to the fixed `/dashboard` path and refresh server-rendered session state.
- On failure, show a generic message such as "Unable to sign in with those credentials."
- Do not distinguish unknown email, wrong password, disabled account or missing membership in the public error text.
- Do not show a sign-up link.
- Do not include password reset or email verification controls in this phase.
- Do not log form values in the browser or server.

The page must retain the current repository's accessible focus styles and visual language rather than introducing a separate design system.

### 10.4 Protected layout

The protected layout must:

- Resolve the server session and workspace context before rendering.
- Redirect unauthenticated requests to `/sign-in`.
- Show the signed-in user's safe display name/email representation.
- Show the active demo organization name and role label.
- Provide navigation to Dashboard and Cases.
- Provide a sign-out action that clears the session and returns to `/sign-in`.
- Avoid passing the session token or full auth object to client components.
- Render a safe error state if the user has no membership.

### 10.5 Dashboard shell

The dashboard is an honest product shell, not a simulated analysis dashboard.

Show:

- A short explanation of the MailSentinel analyst workspace.
- The current organization and role.
- Case count of zero from a tenant-scoped query.
- A clear "No cases yet" state.
- A statement that evidence ingestion will be added in the next phase.

Do not show fabricated risk distributions, provider health, map data or analysis statuses.

### 10.6 Case queue

`/cases` must:

- Require a valid session and membership.
- Adapt the authenticated workspace context to a `TenantScope`, then query through `listCases(scope, filters)`.
- Render an accessible table when test/demo data exists.
- Render a deliberate empty state when no cases exist.
- Keep future filters visually absent or disabled with truthful copy; do not build non-functional filter controls.
- Display only safe case metadata.
- Avoid organization IDs, raw database errors and hidden cross-tenant counts.

### 10.7 Case detail

`/cases/[caseId]` must:

- Require a valid session and membership.
- Call the tenant-scoped `getCase` repository.
- Render one not-found result for an invalid ID and an existing case owned by another organization.
- Show the case number, title, status and priority when a synthetic case exists.
- Show a clear "Analysis not available yet" state because Phase 2 does not implement ingestion.
- Avoid raw email content, object keys, provider results, verdicts or attachment data.

### 10.8 UI safety and accessibility

- Never use color alone for role, status or access state.
- Use text labels and accessible names for all actions.
- Escape all database-backed strings through normal React rendering.
- Do not use `dangerouslySetInnerHTML`.
- Preserve keyboard navigation and visible focus.
- Test at mobile, tablet and desktop widths.
- Provide loading, empty, access-denied and not-found states.
- Do not expose an organization selector before server-side multi-organization rules exist.

## 11. Testing Strategy

### 11.1 Unit tests

Test the role policy exhaustively:

- Every role/permission pair in the matrix.
- Unknown role fails closed.
- Unknown permission fails closed.
- A viewer cannot inherit analyst permissions accidentally.
- Supervisor permissions do not imply admin member management.
- Policy helpers do not accept a client-supplied role.

Test input and projection helpers:

- Organization slug validation.
- Role parsing.
- Case ID format validation.
- Safe case projection excludes future sensitive fields.
- Generic auth error mapping does not reveal account state.

### 11.2 Database integration tests

Run against a disposable PostgreSQL database with migrations applied. Do not substitute SQLite for PostgreSQL behavior.

Test:

- Clean migration creates the expected Better Auth and application tables.
- Migration is idempotent.
- Organization slug uniqueness is enforced.
- Duplicate organization membership is rejected or safely upserted only by the seed path.
- Invalid membership roles are rejected.
- Foreign keys prevent orphan memberships and cases.
- Case number uniqueness is scoped to an organization.
- Queue indexes and status constraints exist where practical.
- Seed creates the expected users, organization and memberships.
- Seed is idempotent and does not create cases.

### 11.3 Tenant-isolation tests

Create two organizations and two users in the test database. Create synthetic case metadata in both organizations. Prove:

- User A lists only organization A cases.
- User B lists only organization B cases.
- User A cannot retrieve a known organization B case ID.
- User A cannot retrieve organization B data by changing a requested organization ID.
- A missing case and an inaccessible case produce the same repository result.
- A user with no membership receives no default organization.
- A user with multiple memberships fails safely until organization selection exists.
- Case counts and pagination metadata are tenant-scoped.
- Role changes are read from the database and are not trusted from a stale browser value.

### 11.4 Auth integration tests

Test the mounted auth route or a supported in-process handler:

- Valid seeded analyst credentials create a session.
- Valid seeded supervisor credentials create a session.
- Invalid credentials receive a generic failure.
- Public sign-up is rejected by the mounted configuration.
- Sign-out invalidates the session.
- Expired or malformed session cookies do not authorize a page.
- Session cookies are HTTP-only and same-site; production secure behavior is tested with the appropriate environment.
- Auth route errors contain a request-safe message and no stack trace.
- No secret, password or token is written to test output.

### 11.5 Browser tests

Add the first Playwright smoke flow now because authentication and protected navigation are browser behavior:

1. Start PostgreSQL, apply migrations and seed synthetic users.
2. Start the Next.js app with test configuration.
3. Visit `/dashboard` without a session and confirm redirect to `/sign-in`.
4. Sign in as the seeded analyst.
5. Confirm `/dashboard` shows the demo organization and analyst role.
6. Confirm `/cases` shows the honest empty state.
7. Navigate to a missing case ID and confirm a not-found result.
8. Sign out and confirm protected routes redirect again.
9. Attempt a viewer flow using a test-created viewer account and confirm read-only behavior where applicable.

Do not put real credentials in Playwright source. Load synthetic values from ignored test environment variables.

### 11.6 Security regression tests

Include:

- Direct access to all protected paths without a session.
- Cross-tenant case ID access.
- Organization ID tampering if any request accepts that field.
- Role tampering in a cookie, form or client payload.
- SQL metacharacters in case IDs and slugs.
- Script-like strings in organization names, case titles and user display names.
- Session fixation or reuse after sign-out.
- Missing membership.
- Multiple memberships before an active-organization selector exists.
- Public sign-up endpoint exposure.
- Secret-like environment values accidentally included in client bundles.

## 12. CI and Developer Operations

### 12.1 Root scripts and Turbo

Add package scripts without breaking the existing setup commands:

- `db:generate` delegates to `@mailsentinel/db` and is explicit.
- `db:migrate` delegates to `@mailsentinel/db` and is uncached.
- `db:seed` delegates to `@mailsentinel/db` and is explicit.
- `db:check` verifies the local schema/connection.

Update Turbo only where needed:

- Make `@mailsentinel/auth` and `@mailsentinel/db` visible to dependent typecheck/build tasks.
- Include schema files and migration files in relevant task inputs.
- Keep database mutation tasks uncached.
- Ensure `pnpm test` includes package and web tests.
- Ensure package scripts do not load production environment files during typecheck or unit tests.

### 12.2 CI database service

Update CI so database-backed tests run against disposable PostgreSQL:

1. Start a PostgreSQL 17 service or an isolated Compose service.
2. Set synthetic test-only `DATABASE_URL` values.
3. Install JavaScript dependencies with the frozen lockfile.
4. Apply migrations using the same `db:migrate` command used locally.
5. Run unit and database integration tests.
6. Run browser tests in the configured test project if enabled.
7. Run lint, typecheck, build and formatting checks.
8. Tear down disposable state automatically.

CI must not:

- Connect to the demo evidence bucket.
- Use live provider keys.
- Print test passwords or database secrets.
- Run the local demo seed with credentials embedded in workflow YAML.
- Treat a migration generation diff as an implicit migration application.

### 12.3 Documentation updates

Update `README.md` and `docs/development-setup.md` with:

- How to add the Phase 2 environment values.
- How to apply migrations.
- How to run the idempotent demo seed.
- How to set synthetic seed passwords without committing them.
- Demo account emails, but never demo passwords.
- How to run database and browser tests.
- A warning that sign-up, upload and analysis are intentionally unavailable.
- A note that the current phase uses one server-resolved organization.

Add `packages/db/README.md` and `packages/auth/README.md` with ownership boundaries and the relevant commands.

## 13. Ordered Execution Plan

Do not start the next workstream until the previous workstream's exit criteria pass.

### Workstream A - Freeze data and auth decisions

Tasks:

- [ ] Run the preflight checks.
- [ ] Record the driver, session-storage and RBAC decisions in ADR 0004.
- [ ] Read the installed Better Auth and Next.js guides.
- [ ] Confirm the exact Better Auth package and CLI versions to pin.
- [ ] Confirm the app-owned membership decision is not being mixed with the organization plugin.
- [ ] Confirm the seed-only user creation path.

Exit criteria:

- The schema owner, auth owner and tenant authorization owner are unambiguous.
- No implementation depends on an unresolved plugin or migration choice.

### Workstream B - Create `@mailsentinel/db`

Tasks:

- [ ] Add package metadata and scripts.
- [ ] Add the PostgreSQL pool and Drizzle client with safe development lifecycle behavior.
- [ ] Add package-local environment validation for `DATABASE_URL`.
- [ ] Add tenancy and case schema files.
- [ ] Generate and review Better Auth schema.
- [ ] Export the combined schema.
- [ ] Add Drizzle config and migration commands.
- [ ] Generate the first migration.
- [ ] Apply it to a clean local database.
- [ ] Add database constraints and repository test helpers.

Exit criteria:

- Clean migration creates all Phase 2 tables.
- The db package typechecks and its migration tests pass.
- No upload, evidence or analysis table is falsely represented as populated.

### Workstream C - Configure Better Auth

Tasks:

- [ ] Add `@mailsentinel/auth` package metadata and dependencies.
- [ ] Implement validated server environment access.
- [ ] Implement the server Better Auth instance.
- [ ] Implement the browser-safe auth client.
- [ ] Add typed session exports.
- [ ] Add the Next.js auth route handler.
- [ ] Configure email/password sign-in, disabled public sign-up, session policy, cookies, trusted origins and rate limits.
- [ ] Confirm the Better Auth generated schema remains in sync after configuration changes.
- [ ] Verify sign-in and sign-out against PostgreSQL.

Exit criteria:

- A seeded user can authenticate through the mounted route.
- The server can retrieve the session from request headers.
- No Better Auth secret or database code is included in the client bundle.
- Auth failures are safe and generic.

### Workstream D - Implement tenant context and policy

Tasks:

- [ ] Define the role and permission matrix.
- [ ] Implement session-to-membership resolution.
- [ ] Implement `requireSession`, `requireWorkspaceContext` and permission guards.
- [ ] Implement organization and case read repositories.
- [ ] Apply tenant predicates in every query.
- [ ] Add safe case projections.
- [ ] Add unit and database tenant-isolation tests.

Exit criteria:

- The repository API cannot accidentally perform an unscoped case read from web code.
- Two-organization integration tests pass.
- Missing and inaccessible case details map to one safe not-found behavior.

### Workstream E - Build seed and fixtures for tests

Tasks:

- [ ] Add synthetic seed environment placeholders.
- [ ] Implement the documented Better Auth seed path.
- [ ] Upsert the demo organization.
- [ ] Create verified analyst and supervisor users.
- [ ] Upsert their memberships.
- [ ] Add isolated test factories for a second organization and synthetic cases.
- [ ] Run the seed twice and compare row counts.

Exit criteria:

- The normal seed produces exactly one demo organization and the expected memberships.
- No password or hash is logged.
- The normal seed produces zero cases.

### Workstream F - Build the protected web shell

Tasks:

- [ ] Add sign-in and session-expired routes.
- [ ] Replace the root setup placeholder with the session-aware redirect.
- [ ] Add protected layout and navigation.
- [ ] Add dashboard with tenant-scoped zero-case state.
- [ ] Add case queue with empty and synthetic-data states.
- [ ] Add case detail with safe not-found behavior.
- [ ] Add sign-out behavior.
- [ ] Test desktop, tablet and mobile layouts.
- [ ] Test keyboard navigation and visible focus.

Exit criteria:

- The analyst browser flow works without developer tools.
- The UI does not imply that upload or analysis is already implemented.
- Protected pages perform server-side checks on every request.

### Workstream G - Integrate CI and document the handoff

Tasks:

- [ ] Add database migration and seed commands to developer docs.
- [ ] Add PostgreSQL-backed integration checks to CI.
- [ ] Add the Playwright auth smoke flow.
- [ ] Add generated-schema/migration review notes.
- [ ] Run the complete verification sequence twice.
- [ ] Record known limitations for Phase 3.

Exit criteria:

- A clean checkout can reach the signed-in empty dashboard using documented commands.
- CI exercises the same migration, auth and isolation behavior as local development.

## 14. Verification Sequence

Run these in order. A later command must not mask an earlier failure.

### 14.1 Static checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
```

Confirm that both new packages and `apps/web` are included.

### 14.2 Clean database check

Use a disposable PostgreSQL database or explicitly reset only the local development volume when it is safe to do so:

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:check
pnpm db:seed
pnpm db:seed
```

Verify:

- The second migration run is a no-op.
- The second seed run does not duplicate rows.
- Better Auth core tables exist.
- Organizations, memberships and cases tables exist.
- The demo seed contains no cases.

### 14.3 Auth and page check

Start the web application using the documented command:

```bash
pnpm dev:web
```

Verify manually or through Playwright:

1. `/` redirects to `/sign-in` without a session.
2. Direct `/dashboard` access redirects to `/sign-in` without a session.
3. Analyst sign-in succeeds.
4. Dashboard shows the demo organization and analyst role.
5. `/cases` shows the empty state.
6. Sign-out returns to `/sign-in`.
7. A missing case renders not-found.
8. Supervisor sign-in shows the supervisor role.
9. A user without membership receives a safe denial.

### 14.4 Tenant test check

```bash
pnpm --filter @mailsentinel/db test
pnpm --filter @mailsentinel/auth test
pnpm --filter @mailsentinel/web test
pnpm test
```

Confirm that tests include two organizations, known cross-tenant case IDs and role matrix assertions.

### 14.5 Build check

```bash
pnpm build
git diff --check
```

Inspect the build output and client bundle boundaries for accidental server-only imports or environment values. Do not treat a successful build as proof of authorization; the isolation tests are required.

## 15. Phase 2 Acceptance Checklist

### Data

- [ ] `@mailsentinel/db` owns the PostgreSQL and Drizzle setup.
- [ ] Better Auth schema was generated from the installed version and reviewed.
- [ ] Application migrations are committed and repeatable.
- [ ] `organizations`, `organization_members` and `cases` have tenant constraints and indexes.
- [ ] No future evidence or verdict data is populated as a fake result.

### Authentication

- [ ] Email/password sign-in works for seeded analyst and supervisor users.
- [ ] Public sign-up is disabled in the mounted runtime.
- [ ] Sign-out invalidates the session.
- [ ] Sessions are stored in PostgreSQL for this phase.
- [ ] Cookies are HTTP-only and same-site, with secure production behavior.
- [ ] CSRF and origin protections remain enabled.
- [ ] Auth rate limiting is enabled and tested at the configured boundary.
- [ ] Auth errors do not disclose account state, secrets or stack traces.

### Authorization

- [ ] The four application roles are typed and explicitly mapped to permissions.
- [ ] Session, membership and role are resolved server-side.
- [ ] Every case repository query includes the resolved organization predicate.
- [ ] Browser-supplied organization IDs and roles cannot grant access.
- [ ] Missing membership fails closed.
- [ ] Cross-tenant reads return the same safe result as missing records.
- [ ] Viewer, analyst, supervisor and admin matrix tests pass.

### Web shell

- [ ] Unauthenticated users are redirected to sign-in.
- [ ] `/dashboard`, `/cases` and `/cases/[caseId]` are protected.
- [ ] The dashboard and queue show truthful empty states.
- [ ] Case detail does not reveal inaccessible case existence.
- [ ] Sign-out and session-expiry behavior are understandable.
- [ ] No upload, analysis, map, verdict or report feature is falsely presented as ready.
- [ ] Keyboard, focus and responsive checks pass.

### Engineering

- [ ] Seed is idempotent and uses synthetic values only.
- [ ] Passwords and hashes never appear in source, logs, screenshots or CI output.
- [ ] Root checks include the new packages.
- [ ] CI runs migrations and PostgreSQL-backed isolation tests.
- [ ] Browser smoke tests cover sign-in and protected navigation.
- [ ] README and development setup docs describe the new commands and boundaries.
- [ ] `PLAN.md` remains unchanged by this phase-document replacement.

## 16. Handoff To Phase 3

Phase 3 may begin only after the Phase 2 acceptance checklist passes.

Phase 3 must reuse:

- The Better Auth server/client boundary.
- `getSessionContext()` and permission guards.
- `@mailsentinel/db` migration workflow.
- Tenant-scoped repositories and ID rules.
- The `cases` table and status vocabulary.
- The seeded demo organization and synthetic test factories.
- The PostgreSQL and MinIO local services.

Phase 3 must add, rather than bypass:

- `evidence_artifacts`, `analysis_runs` and audit records through new migrations.
- A protected upload route that calls the existing permission policy.
- Server-generated case IDs and tenant-owned object keys.
- Hash verification and transactional case/run writes.
- Analyzer intake authentication and queue submission.
- Queued/progress/failure states backed by persisted data.

Phase 3 must not:

- Create a second auth system.
- Read cases without the Phase 2 tenant predicate.
- Accept organization membership from a browser field.
- Put raw email content in the case table or logs.
- Treat the Phase 2 empty UI as evidence that ingestion exists.

## 17. References

Read these before implementation and prefer the installed package documentation when it differs from an online example:

- `PLAN.md`, sections 11, 12, 18, 21 and Phase 2.
- Better Auth Next.js integration: <https://better-auth.com/docs/integrations/next>
- Better Auth Drizzle adapter: <https://better-auth.com/docs/adapters/drizzle>
- Better Auth database and schema guidance: <https://better-auth.com/docs/concepts/database>
- Better Auth CLI: <https://better-auth.com/docs/concepts/cli>
- Better Auth email/password guidance: <https://better-auth.com/docs/authentication/email-password>
- Better Auth session management: <https://better-auth.com/docs/concepts/session-management>
- Better Auth security reference: <https://better-auth.com/docs/reference/security>
- Better Auth options reference: <https://better-auth.com/docs/reference/options>
- Next.js installed guides under `node_modules/next/dist/docs/`.

The implementation is complete only when it preserves the evidence boundary for the next phase: identity is real, tenancy is explicit, and every case read is traceable to a server-resolved organization context.
