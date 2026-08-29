# ADR 0003: Local infrastructure as code

- Status: Accepted
- Date: 2026-08-29

## Context

Setup should leave a reproducible development environment with a database, queue transport, and S3-compatible evidence storage.

## Decision

- Use PostgreSQL 17 for metadata.
- Use Redis locally for temporary queue/cache behavior.
- Use MinIO as the local S3-compatible storage service.
- Use Docker Compose with persistent named volumes and a private network.
- Initialize a private `mailsentinel-evidence` bucket idempotently.

## Consequences

- New developers can bring the local stack up with one command.
- Named volumes preserve local state across normal restarts.
- Reset is explicit and destructive rather than accidental.
- The console and storage endpoints remain local-only.
