# MailSentinel database package

`@mailsentinel/db` owns the PostgreSQL connection, Drizzle schema, committed migrations, tenant-scoped repositories and synthetic local seed.

## Commands

Run these from the repository root:

```bash
pnpm auth:schema:generate
pnpm db:generate
pnpm db:migrate
pnpm db:check
pnpm db:seed
```

`auth:schema:generate` requires a temporary or local `BETTER_AUTH_SECRET` and must be followed by a review of the generated schema. `db:generate` creates a migration but never applies it. `db:migrate` is the only normal schema-application command.

The package loads the ignored root `.env` for CLI and seed commands. The web application supplies its own runtime environment through `apps/web/.env`.

## Schema ownership

- `src/schema/auth.ts` is generated from Better Auth `1.7.2`; do not hand-edit it.
- `src/schema/tenancy.ts` owns organizations and application memberships.
- `src/schema/cases.ts` owns the metadata-only Phase 2 case shell.
- `src/repositories/` contains tenant-scoped read functions.
- Evidence, analysis, provider and audit tables are added in later phases.

Repositories accept a `TenantScope` and always include its organization ID in the query. They must not be replaced with unscoped ID lookups.

## Seed safety

The seed creates only synthetic `.test` users, one demo organization and two memberships. It does not create cases or evidence. Passwords are read from ignored environment variables and are never printed or committed. Existing users are not silently assigned a new password.
