# ADR 0005: Evidence ingestion metadata and tenant boundaries

- Status: Accepted
- Date: 2026-08-29

## Context

Phase 3 needs to preserve an uploaded raw `.eml` object while making its case,
analysis-run and audit metadata durable in PostgreSQL. The database must support
safe retries and same-organization duplicate detection without allowing a case,
artifact, run or audit event to be associated with another organization.

The web upload, object-storage adapter and analyzer queue consume this database
contract. The Phase 3 implementation deliberately stops at verified evidence
and safe deferral; it does not implement the forensic parser.

## Decision

- Add a nullable, maximum-128-character `cases.idempotency_key` and enforce
  uniqueness per organization with a partial unique index. Idempotency keys are
  never queried without the organization predicate.
- Store evidence metadata in `evidence_artifacts`, including the lowercase
  SHA-256 digest, exact byte count, validated content type and private object
  key. The database does not store raw email bytes and does not impose a
  uniqueness constraint on the digest.
- Store one Phase 3 `analysis_runs` row for an intake. Runs start as `queued`,
  use the existing case-status vocabulary, use `provider_mode = offline`, and
  may be conditionally moved to `analysis_deferred`.
- Store append-only audit records in `audit_events`. Metadata is accepted only
  as a caller-provided redacted JSON object; repository APIs do not accept raw
  message bodies or headers.
- Add composite foreign keys from artifacts, runs and case-linked audit events
  to `(cases.organization_id, cases.id)`. This makes the tenant/case
  relationship enforceable by PostgreSQL, in addition to tenant predicates in
  repository queries.
- Expose only narrow repository operations for idempotency lookup, same-tenant
  hash lookup, transactional intake creation, safe ingestion projection,
  conditional deferral and audit insertion.
- `getCaseIngestionProjection` intentionally excludes `object_key`. Object
  storage access and analyzer intake are not part of this database package.

## Consequences

- A retry can resolve its original case within one organization without
  revealing state from another organization.
- Duplicate content can be detected within a tenant while allowing the same
  digest in separate tenants and allowing an explicit future duplicate-case
  workflow.
- Composite keys add a small supporting uniqueness constraint on `cases` so
  PostgreSQL can enforce tenant-safe relationships.
- Case/artifact/run/audit metadata either commits together or rolls back
  together through `createCaseIntake`.
- Queue acceptance and service-generated audit events require the web/analyzer
  workstreams to call the repository with their own correlation IDs.
- The web route preserves evidence before analyzer acceptance, and the worker
  can only end in `analysis_deferred` or a safe integrity failure until the
  parser phase replaces its deferred body.
