# ADR 0004: Data, authentication and tenant RBAC

- Status: Accepted
- Date: 2026-08-29

## Context

Phase 2 needs real identity, PostgreSQL-backed sessions, one demo organization and exact application roles. The case queue must be tenant-scoped before upload and analysis are implemented. Better Auth's organization plugin has its own membership tables and default owner/admin/member role model, which would introduce a second source of truth for this prototype's application roles.

## Decision

- Use `pg` with `drizzle-orm/node-postgres` and PostgreSQL as the metadata source of truth.
- Generate Better Auth core tables from the pinned Better Auth `1.7.2` configuration and keep them in the shared Drizzle schema.
- Keep Better Auth core responsible for user identity and sessions only.
- Own `organizations` and `organization_members` in the application schema.
- Use explicit application roles: `viewer`, `analyst`, `supervisor` and `admin`.
- Enforce authorization with server-side session plus membership resolution and tenant predicates in every repository query.
- Do not enable Better Auth's organization plugin until invitations, teams or multi-organization switching become a real requirement.
- Keep sessions in PostgreSQL; do not configure Redis secondary storage or cookie session caching in Phase 2.
- Disable public sign-up and seed only synthetic, verified demo accounts through Better Auth's password hashing path.
- Use server-rendered protected pages and repositories for the read-only case shell. Public case APIs begin with evidence ingestion.

## Consequences

- The exact prototype roles do not depend on Better Auth's built-in organization roles.
- There is one membership table to query and protect.
- Adding organization invitations later requires a deliberate plugin or application workflow decision and migration.
- The database package remains independent of Next.js and auth request handling.
- Cross-tenant access can be tested directly against PostgreSQL before upload is implemented.
- Redis remains available for the future analysis queue without becoming an identity store.
