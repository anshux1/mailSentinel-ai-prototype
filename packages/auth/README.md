# MailSentinel auth package

`@mailsentinel/auth` owns the Better Auth server instance, browser client, session types and application permission policy.

## Boundaries

- Import `@mailsentinel/auth/server` only from server code.
- Import `@mailsentinel/auth/client` only from client components.
- The mounted Next.js handler lives at `apps/web/src/app/api/auth/[...all]/route.ts`.
- Identity and sessions are stored in PostgreSQL through the Drizzle adapter.
- Organization memberships and application roles are stored in `@mailsentinel/db`; Better Auth's organization plugin is intentionally not enabled.

The runtime configuration enables email/password sign-in and disables public sign-up. Demo users are created by the database seed through a separate, never-mounted seed-only Better Auth instance.

## Security rules

- Keep `BETTER_AUTH_SECRET` outside source control and use at least 32 high-entropy characters.
- Keep CSRF and origin checks enabled.
- Keep HTTP-only, same-site cookies and use secure cookies in production.
- Treat `resolveWorkspaceContext` as the server-side membership boundary.
- Treat client-side permission checks as presentation only; server checks remain authoritative.

The package is pinned to Better Auth `1.7.2`. Read the installed documentation before changing the auth options or regenerating the schema.
