# ADR 0001: Polyglot monorepo boundaries

- Status: Accepted
- Date: 2026-08-29

## Context

MailSentinel has a web application and requires a separate analyzer service, local infrastructure, shared configuration, and later product packages. Splitting those into separate repositories would make versioning, lockfiles, and cross-run orchestration harder than necessary.

## Decision

Use one monorepo:

- Keep the web application under `apps/web` and expose it as the public-facing Next.js package.
- Keep the analyzer workspace under `apps/analyzer`.
- Keep reusable packages under `packages/`, creating them only when a real consumer exists.
- Keep local infrastructure and scripts under `infra/`.

## Consequences

- One `pnpm` workspace coordinates the JavaScript and Python packages.
- Package naming uses the private scope `@mailsentinel`.
- New shared packages are created only when there is a real consumer.
- The repository can grow without changing its package boundaries.
