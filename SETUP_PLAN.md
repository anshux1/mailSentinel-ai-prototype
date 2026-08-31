# MailSentinel AI - Phase 3 Evidence Ingestion Plan

> This file replaces the Phase 2 plan. It is scoped to Phase 3 of `PLAN.md`: preserving a raw `.eml` file, creating the associated case metadata, authenticating the analyzer intake, enqueueing work, and exposing truthful progress. It does not implement parsing or a verdict.

> **Phase goal:** an authorized analyst can submit a bounded raw `.eml` file, the exact bytes are protected in object storage with a verified SHA-256 hash, the case and analysis run are persisted, and the analyzer queue receives an authenticated idempotent job.

> **Truthfulness rule:** until Phase 4 adds the forensic parser, the system must remain in `queued` or move to `analysis_deferred`. It must never show `completed`, a verdict, or fabricated forensic observations.

## 1. Phase Contract

### 1.1 Upstream scope

This plan implements the following Phase 3 tasks from `PLAN.md`:

- [ ] Build the `.eml` upload UI.
- [ ] Implement streaming size/type validation.
- [ ] Compute SHA-256 while receiving.
- [ ] Store bytes in MinIO/S3.
- [ ] Create case, artifact and analysis-run records.
- [ ] Add audit events.
- [ ] Implement analyzer intake authentication.
- [ ] Enqueue an idempotent job.
- [ ] Show queued, progress and failure states.
- [ ] Verify the storage hash round trip.

The Phase 3 deliverable is:

> Upload reliably creates a queued case and protected artifact, and analyzer or queue failure preserves the evidence instead of losing it or returning a false clean result.

### 1.2 Required outcome

At the end of this phase:

1. Only an authenticated analyst, supervisor or admin can submit an upload.
2. The browser sends the file only to Next.js; it never calls FastAPI or MinIO directly.
3. Upload validation is bounded by byte size, file name, content type and request timeouts.
4. The original bytes are streamed to private object storage while their exact size and SHA-256 are calculated.
5. Object keys contain opaque server-generated IDs and no sender, subject or file-name-derived path.
6. Case, artifact, analysis-run and audit metadata are persisted with the authenticated organization ID.
7. A retry with the same idempotency key returns the original result rather than creating a second case.
8. A same-organization duplicate hash produces a confirmation response; it never leaks another organization's case.
9. The internal analyzer accepts only a valid service credential and a relation-valid request.
10. A Dramatiq + Redis job is enqueued using `analysis_run_id` as its idempotency identity.
11. Queue submission failure preserves the case and artifact and records `analysis_deferred` with a safe error code.
12. The case page displays the hash, byte size, upload metadata and truthful queued/deferred state without showing raw email content.
13. Tests cover successful upload, invalid input, oversized input, duplicate handling, hash mismatch, analyzer outage, queue restart, idempotency and tenant isolation.

### 1.3 Explicit non-goals

Do not implement these items in Phase 3:

- MIME parsing or header extraction.
- Authentication-Results, SPF, DKIM or DMARC evaluation.
- Received-hop reconstruction or trusted-boundary logic.
- URL, domain, IP or attachment extraction.
- DNS, RDAP, GeoIP or reputation calls.
- Risk, confidence, scoring rules or machine-learning output.
- Opening, visiting, rendering or executing the email or attachments.
- Report generation, report downloads or full evidence ledger UI.
- Organization switching, invitations, teams or membership management.
- Public sign-up, email verification delivery or password reset.
- Direct browser access to the object-storage bucket.
- A fake `completed` state used only to make the demo look finished.

The worker may retrieve and verify the stored object before deferring to the parser phase. It must not inspect it as a forensic parser or create observations.

## 2. Starting Point

### 2.1 Phase 2 foundation to reuse

The Phase 2 implementation already provides:

- `apps/web` as the Next.js 16.3.3 application.
- `packages/auth` with Better Auth 1.7.2, database-backed sessions and email/password sign-in.
- `packages/db` with Drizzle, PostgreSQL, the generated Better Auth schema and the `cases` table.
- `TenantScope` and tenant-scoped case repositories.
- Application roles: `viewer`, `analyst`, `supervisor` and `admin`.
- `case_status` values including `queued`, `analysis_deferred` and `failed`.
- `infra/compose.yaml` with PostgreSQL, Redis and a private MinIO bucket.
- Existing `ANALYZER_INTERNAL_URL` and `ANALYZER_SERVICE_TOKEN` configuration names.
- Protected `/dashboard`, `/cases` and `/cases/[caseId]` routes.
- Vitest, Playwright, pytest, Ruff, mypy and CI foundations.

Do not create a second auth client, database client, organization membership table or case repository.

### 2.2 Current gaps

The following must be added or extended:

- `evidence_artifacts`, `analysis_runs` and `audit_events` tables.
- An idempotency key on case intake, or an equivalent tenant-scoped idempotency record.
- S3/MinIO streaming client in server-only web code.
- Upload validation and hash pipeline.
- Analyzer intake contract and token guard.
- Dramatiq broker, actor and safe deferred behavior.
- Read-only case status/evidence metadata endpoints.
- `/cases/new` upload experience and status polling.
- Synthetic transport fixture and integration test setup.

### 2.3 Preflight

Run the existing Phase 2 checks before adding Phase 3 code:

```bash
pnpm install --frozen-lockfile
uv sync --locked --project apps/analyzer
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Start local dependencies and verify the private bucket before any upload test:

```bash
pnpm infra:up
docker compose --env-file .env -f infra/compose.yaml ps
```

If Docker is unavailable, use a separately managed local PostgreSQL/Redis/MinIO stack only for local development. CI must use disposable services and must never use a demo or production bucket.

## 3. Decisions To Freeze

Record these decisions in `docs/adr/0005-evidence-ingestion.md` before implementation. Do not proceed with migrations while any choice changes the ownership or failure semantics below.

| Area | Decision | Reason |
|---|---|---|
| Queue | Dramatiq with Redis | ADR 0002 already selected it for the prototype; it is smaller than Celery for this phase. |
| Upload transport | Raw request body, not buffered multipart parsing | A single raw stream makes byte accounting and hash calculation explicit and avoids loading a multipart file into memory. |
| Browser upload headers | `X-Original-Filename`, `Content-Type`, `Idempotency-Key` and optional `X-Allow-Duplicate` | The file bytes stay in the request body while metadata remains bounded and explicit. |
| Web runtime | Node.js runtime for upload and S3 routes | The route needs Node streams, hashing and the AWS SDK. |
| Object storage | Private MinIO/S3 bucket with server credentials | Original evidence must not be exposed to the browser or stored in PostgreSQL. |
| Hash | SHA-256 of the exact received bytes | It is reproducible, widely supported and required by the master plan. |
| Duplicate behavior | Check hash only within the resolved organization; require explicit confirmation for a new case | This supports investigation without cross-tenant existence leakage. |
| Retry behavior | Require a bounded idempotency key for each intake attempt | A browser retry after a response timeout must not create duplicate evidence records. |
| Queue outage | Preserve metadata and artifact; set `analysis_deferred` and return a safe `503` response containing the case ID | Evidence preservation is more important than pretending analysis was accepted. |
| Parser boundary | A Phase 3 worker verifies integrity and then defers with `PARSER_NOT_AVAILABLE` | Phase 4 owns parsing; this phase must not produce a false completed analysis. |
| Evidence downloads | Not exposed yet | Signed URLs and evidence presentation need a reviewed evidence-access policy in a later dashboard phase. |

### 3.1 Existing Phase 2 contracts that must not change

- Better Auth remains the only identity provider.
- `resolveWorkspaceContext()` remains the source of the authenticated organization and role.
- Web repositories accept a database-owned tenant scope, never a browser-provided organization ID.
- PostgreSQL remains the metadata source of truth.
- Redis remains temporary queue/cache infrastructure.
- Existing `.env` files remain ignored and examples contain placeholders only.

## 4. End-to-End Workflow

### 4.1 Successful request

Implement the request path in this order:

```text
browser selects bounded .eml file
  -> client validates obvious local constraints
  -> client generates Idempotency-Key
  -> client sends raw bytes to Next.js POST /api/cases
  -> Next.js validates origin, session, role, headers and content length
  -> Next.js checks existing idempotency key for this organization
  -> Next.js streams bytes to private S3/MinIO while hashing and counting
  -> Next.js verifies the completed object metadata
  -> Next.js checks same-organization duplicate SHA-256
  -> PostgreSQL transaction inserts case, artifact, analysis run and audit events
  -> Next.js calls authenticated FastAPI POST /v1/analyses
  -> FastAPI validates request relation and enqueues the Dramatiq message
  -> Next.js returns case ID and queued status
  -> browser navigates to case detail and polls minimized status
```

### 4.2 Failure semantics

| Failure point | Persist object? | Persist metadata? | Response/state | Required cleanup |
|---|---:|---:|---|---|
| Missing session or insufficient role | No | No | `401` or `403` | None. |
| Invalid origin, filename, content type or idempotency key | No | No | `400` | None. |
| Known `Content-Length` over limit | No | No | `413` | Do not start storage upload. |
| Stream exceeds limit | Maybe partial | No | `413` | Abort multipart upload and remove partial object. |
| Empty body | No | No | `400` | None. |
| S3/MinIO write failure | No complete object | No | `503` safe intake error | Abort and clean incomplete upload. |
| Hash or object metadata mismatch | Untrusted object not retained | No | `503` integrity error | Delete object; alert through safe logs. |
| Duplicate hash without confirmation | Temporary object removed | No new rows | `409 DUPLICATE_ARTIFACT` | Delete temporary object. |
| PostgreSQL transaction failure | Complete object may exist briefly | No committed rows | `500` safe intake error | Best-effort object deletion; record only safe cleanup diagnostics. |
| Analyzer unavailable after DB commit | Yes | Yes | `503 ANALYSIS_DEFERRED` and case ID | Keep evidence; no deletion. |
| Analyzer rejects relation/contract | Yes | Yes | `503` or `409` according to code | Keep evidence; mark run safely failed/deferred. |
| Redis enqueue failure | Yes | Yes | `503 ANALYSIS_DEFERRED` and case ID | Keep evidence; allow operational retry later. |
| Browser disconnect after commit | Yes | Yes | Client sees network failure | Retry with same idempotency key returns the original case. |
| Worker object verification failure | Yes | Yes | `failed` or `analysis_deferred` with safe code | Preserve object for investigation; never overwrite it. |

Never delete a committed original artifact solely because analysis is unavailable.

### 4.3 State model for this phase

The case and analysis run use the existing status vocabulary, but Phase 3 permits only these transitions:

```text
new intake -> queued
queued -> analysis_deferred        # analyzer/queue unavailable or parser not implemented
queued -> failed                   # integrity or permanent intake/worker failure
```

Do not transition to `parsing`, `extracting`, `enriching`, `scoring` or `completed` until the corresponding later phase owns that transition.

## 5. Database Extension

### 5.1 Migration rules

Create a new Drizzle migration after reviewing the existing Phase 2 migration. Do not edit the applied Phase 2 migration and do not use runtime schema synchronization.

Before generating SQL:

1. Inspect the existing `cases` schema and enum definitions.
2. Add only Phase 3 columns/tables.
3. Review foreign-key deletion behavior.
4. Review every index and uniqueness rule.
5. Generate the migration with the existing `pnpm db:generate` command.
6. Inspect the SQL for unintended drops or enum replacement.
7. Apply it to a clean database and an already Phase 2-migrated database.

### 5.2 Extend `cases`

Add an optional `idempotency_key` column to `cases`:

| Column | Rule | Purpose |
|---|---|---|
| `idempotency_key` | nullable bounded text, maximum 128 characters | Client retry identity for intake. |

Add a partial unique index on `(organization_id, idempotency_key)` where the key is not null. A key is scoped to an organization; it must never be globally queried without that scope.

Do not use the original filename, subject or sender as an idempotency key.

### 5.3 `evidence_artifacts`

Create the artifact metadata table:

| Column | Rule | Purpose |
|---|---|---|
| `id` | opaque text primary key | Artifact identifier used in object keys. |
| `organization_id` | non-null FK to `organizations.id` | Tenant owner. |
| `case_id` | non-null FK to `cases.id` | Case owner. |
| `kind` | enum: `original_eml`, `attachment`, `report` | Phase 3 inserts only `original_eml`; future values reserve the contract. |
| `object_key` | non-null bounded text, unique | Private S3/MinIO object location. |
| `sha256` | non-null lowercase hex text of length 64 | Exact object digest. |
| `content_type` | non-null bounded text | Validated/requested content type. |
| `byte_size` | non-negative integer | Exact received byte count. |
| `encryption_key_reference` | nullable bounded text | Future KMS/application encryption reference. |
| `created_at` | UTC `timestamptz` | Receive/persistence time. |

Indexes and constraints:

- Index `(organization_id, sha256)` for same-tenant duplicate detection.
- Index `(organization_id, case_id, created_at)` for case artifact metadata.
- Unique `object_key`.
- Check SHA-256 is exactly 64 lowercase hexadecimal characters.
- Check `byte_size` is greater than zero for `original_eml`.
- Foreign keys prevent an artifact from pointing to another organization’s case.
- Do not add a unique hash constraint; explicit duplicate confirmation permits a new case with the same artifact hash.

### 5.4 `analysis_runs`

Create one row for each requested analysis run:

| Column | Rule | Purpose |
|---|---|---|
| `id` | opaque text primary key | Queue idempotency identity. |
| `organization_id` | non-null FK to organizations | Tenant owner. |
| `case_id` | non-null FK to cases | Case being analyzed. |
| `status` | existing case status vocabulary | Starts at `queued`. |
| `analysis_version` | non-null bounded text | Analysis implementation version. |
| `rules_version` | non-null bounded text | Rule contract version; use an ingestion-only value until scoring exists. |
| `model_version` | nullable bounded text | Null in Phase 3. |
| `started_at` | nullable UTC timestamp | Null until parser work begins. |
| `completed_at` | nullable UTC timestamp | Null for queued/deferred runs. |
| `failure_code` | nullable bounded machine code | Safe operational failure code. |
| `failure_message_safe` | nullable bounded text | User-safe explanation without message content. |
| `provider_mode` | enum: `fixture`, `offline`, `live` | Use `offline` in Phase 3 because no provider enrichment runs. |
| `created_at` | UTC timestamp | Run creation time. |
| `updated_at` | UTC timestamp | Last lifecycle update. |

Constraints and indexes:

- Index `(organization_id, case_id, created_at)`.
- Index `(status, updated_at)` for operational queue views.
- Foreign key `(organization_id, case_id)` must not permit a cross-tenant pair. If PostgreSQL cannot enforce this with the current keys, enforce the relation in the transaction and repository query.
- At most one active Phase 3 run may be associated with a given idempotency key.
- No verdict row is created in this phase.

### 5.5 `audit_events`

Create an append-only audit table:

| Column | Rule | Purpose |
|---|---|---|
| `id` | opaque text primary key | Event identifier. |
| `organization_id` | non-null FK to organizations | Tenant scope. |
| `actor_type` | enum `user` or `service` | Initiator category. |
| `actor_id` | bounded text | Better Auth user ID or safe service ID such as `analyzer`. |
| `action` | bounded text | Examples: `case.created`, `evidence.uploaded`, `analysis.queued`, `analysis.deferred`, `case.viewed`. |
| `case_id` | nullable FK to cases | Related case when applicable. |
| `target_type` | bounded text | `case`, `evidence_artifact` or `analysis_run`. |
| `target_id` | nullable bounded text | Related entity identifier. |
| `request_id` | non-null bounded text | Correlation ID. |
| `ip_address_masked` | nullable bounded text | Masked address only; never raw forwarded chains. |
| `metadata_redacted` | JSONB/object | Counts, status and IDs only; no message body/header. |
| `created_at` | UTC timestamp | Append time. |

Rules:

- Expose insert-only audit helpers; do not expose update/delete helpers.
- Append a new correction event instead of changing an old event.
- Do not write an event for every polling request; polling is not an analyst evidence view.
- Record `case.viewed` on the initial authorized case page request if that page is treated as a case access event.
- Record `evidence.viewed` only when a future authorized artifact download is implemented; Phase 3 has no artifact download endpoint.

### 5.6 Repository surface

Extend `@mailsentinel/db` with narrow functions:

```text
findCaseByIdempotencyKey(scope, key)
findArtifactByHash(scope, sha256)
createCaseIntake(scope, input)
getCaseIngestionProjection(scope, caseId)
appendAuditEvent(input)
markAnalysisDeferred(scope, runId, failureCode, safeMessage)
```

Repository rules:

- `createCaseIntake` inserts case, artifact, run and initial audit events in one transaction.
- The transaction verifies that `organization_id` on every inserted row matches the trusted scope.
- The idempotency lookup and duplicate lookup always include the organization predicate.
- `getCaseIngestionProjection` returns filename, byte size, SHA-256, artifact kind, run status and safe timestamps, but never `object_key`.
- `appendAuditEvent` accepts a redacted metadata object and does not accept raw body/header parameters.
- State updates use conditional predicates such as `WHERE id = run_id AND status = 'queued'` to prevent duplicate worker transitions.
- No browser route can call an unscoped artifact or case lookup.

## 6. Object Storage and Streaming Intake

### 6.1 Storage adapter

Add a server-only adapter under `apps/web/src/server/storage/` or a package with a real web consumer:

- Use `@aws-sdk/client-s3` for S3-compatible commands.
- Use `@aws-sdk/lib-storage` `Upload` for unknown-length streams and multipart handling.
- Configure endpoint, region, bucket, access key, secret and path-style behavior from the existing server environment parser.
- Keep one bounded client/pool in development; do not create a new client for every chunk.
- Never expose credentials or signed URLs to client JavaScript.
- Use `leavePartsOnError: false` and explicitly abort/clean incomplete multipart uploads.

### 6.2 Object key

Generate server-side IDs before writing bytes:

```text
organizations/{organizationId}/cases/{caseId}/artifacts/{artifactId}.eml
```

Rules:

- Use opaque IDs only.
- Do not use sender, subject, Message-ID, filename or hash as a path segment.
- Store the key only in PostgreSQL and server-side logs when required for cleanup.
- Do not return the key in web JSON or client props.
- The bucket remains private; no public ACL, public policy or browser CORS access is needed for Phase 3.

### 6.3 Stream and hash algorithm

Implement one bounded pipeline with no unbounded `Buffer` accumulation:

1. Validate `Content-Length` when present; reject values over `MAX_EML_BYTES` before opening storage.
2. Require a non-null request body.
3. Create a SHA-256 hash and byte counter.
4. Create a Node `PassThrough` or equivalent bounded stream connected to S3 `Upload`.
5. Read the Next.js `Request.body` incrementally.
6. For each chunk, reject a non-`Uint8Array` conversion failure safely.
7. Add the chunk length to the counter before writing.
8. If the count exceeds `MAX_EML_BYTES`, abort storage and stop consuming the request.
9. Update the hash with the exact chunk bytes.
10. Write the exact chunk to the storage stream with backpressure handling.
11. End the stream only after the request body ends.
12. Await S3 completion and calculate the lowercase SHA-256 digest.
13. Verify the stored object `ContentLength` and stored SHA-256 metadata match the counter/digest.
14. Reject zero-byte input.
15. Keep the original object immutable after completion.

If any stream, request or storage error occurs, destroy/abort all connected streams and make a best-effort cleanup attempt. Do not retry a partial upload blindly with a new case ID.

### 6.4 Type and filename validation

Client MIME is untrusted, but explicit unsupported values should be rejected. Accept only:

- `message/rfc822`.
- `application/octet-stream`.
- `text/plain` when the browser cannot identify an `.eml` file.

The extension is required and case-insensitive:

- Read `X-Original-Filename`.
- Reject missing, empty, overlong or non-`.eml` values.
- Normalize Unicode to a stable display form.
- Remove control characters and path separators.
- Keep only a sanitized display filename, capped at 255 characters.
- Do not use the sanitized filename for object identity.

Do not attempt to parse the email body here. A syntactically malformed but bounded `.eml` must be preserved for the parser phase to classify later.

### 6.5 Request headers

Require and validate:

| Header | Rule |
|---|---|
| `Content-Type` | One accepted value; client value is not proof of message validity. |
| `X-Original-Filename` | ASCII/Unicode display value, sanitized and bounded. |
| `Idempotency-Key` | Opaque 16-128 character value, no control characters, required for POST. |
| `X-Allow-Duplicate` | Exact `true` only on an explicit confirmation retry; never an authorization mechanism. |
| `Origin` | Must match a configured trusted web origin for cookie-authenticated mutation. |
| `X-Request-ID` | Optional bounded caller correlation ID; otherwise generate a server request ID. |

Do not accept organization ID, user ID, role, object key, artifact ID, case ID or SHA-256 from the browser as authoritative input.

## 7. Web API and Server Flow

### 7.1 `POST /api/cases`

Add a Node-runtime route handler at:

```text
apps/web/src/app/api/cases/route.ts
```

The handler must:

1. Generate or validate a request ID.
2. Validate the `Origin` header against the configured application origin.
3. Resolve the Phase 2 workspace context from the session.
4. Require `case.create` permission.
5. Validate content type, filename, idempotency key and declared content length.
6. Check for an existing case with the same tenant-scoped idempotency key.
7. Stream/hash/store the bytes.
8. Check for a same-organization duplicate hash.
9. Remove a temporary object and return `409` when confirmation is required.
10. Create case/artifact/run/audit rows transactionally.
11. Call the internal analyzer intake client with server credentials.
12. Conditionally mark the run/case deferred if intake fails.
13. Return a minimized response.

Do not call `request.formData()` for the file body if it buffers the full payload. Use the installed Next.js Node-runtime streaming conventions.

### 7.2 Success response

Return `202 Accepted` when the analyzer intake is accepted:

```json
{
  "caseId": "case_...",
  "caseNumber": "MS-000001",
  "analysisRunId": "run_...",
  "status": "queued",
  "artifact": {
    "kind": "original_eml",
    "sha256": "...",
    "byteSize": 24831,
    "contentType": "message/rfc822",
    "originalFilename": "message.eml"
  },
  "requestId": "req_..."
}
```

Return `200 OK` with the same minimized result and an `Idempotent-Replay: true` header when the idempotency key already completed. Do not write a second object or audit event for an idempotent replay.

### 7.3 Error responses

Use safe machine-readable bodies:

```json
{
  "code": "UPLOAD_TOO_LARGE",
  "message": "The email file exceeds the configured size limit.",
  "requestId": "req_..."
}
```

Required mappings:

| Status | Codes/examples | Behavior |
|---:|---|---|
| `400` | `INVALID_FILENAME`, `INVALID_CONTENT_TYPE`, `INVALID_IDEMPOTENCY_KEY`, `EMPTY_UPLOAD` | No case or artifact rows. |
| `401` | `AUTH_REQUIRED` | Do not reveal case or organization state. |
| `403` | `UPLOAD_NOT_ALLOWED`, `ORIGIN_NOT_ALLOWED` | Do not reveal tenant data. |
| `404` | Not used for intake authorization failures unless a future route needs it | Do not use it to reveal duplicate state. |
| `409` | `DUPLICATE_ARTIFACT`, `IDEMPOTENCY_CONFLICT` | Same-tenant duplicate details only; explicit confirmation is required for a new case. |
| `413` | `UPLOAD_TOO_LARGE` | Abort/clean storage. |
| `500` | `INTAKE_PERSISTENCE_FAILED` | Return no raw database error. |
| `503` | `STORAGE_UNAVAILABLE`, `ANALYSIS_DEFERRED`, `QUEUE_UNAVAILABLE` | Preserve committed evidence and include the case ID only when it exists. |

Never return a Python traceback, S3 response, database URL, service token, raw provider response or email content.

### 7.4 Duplicate and idempotency behavior

#### Idempotency lookup before storage

- Resolve the tenant from the session.
- Look up `(organization_id, idempotency_key)`.
- If found and the request identity is compatible, return the existing case projection.
- If found but the request attempts to change the file, return `409 IDEMPOTENCY_CONFLICT`.
- Never look up an idempotency key across all organizations.

#### Duplicate hash lookup after storage

- Compute the new object's hash first.
- Query `evidence_artifacts` by `(organization_id, sha256)`.
- If no match exists, continue.
- If a match exists and `X-Allow-Duplicate` is not exact `true`, delete the new temporary object and return `409 DUPLICATE_ARTIFACT` with the existing case's safe ID/number.
- If confirmation is present, create a new case with a new case ID, artifact ID and analysis run ID.
- Never reveal a duplicate artifact in a different organization.

### 7.5 Analyzer client

Create a server-only client under `apps/web/src/server/analyzer-client.ts`:

- Use `ANALYZER_INTERNAL_URL` and `ANALYZER_SERVICE_TOKEN` from server-only configuration.
- Send a short timeout, for example 3 seconds for intake acceptance.
- Send `Authorization: Bearer <token>` or the single header selected in ADR 0005.
- Send request ID for correlation.
- Parse only the documented response contract.
- Map timeout, connection reset and `5xx` to `QUEUE_UNAVAILABLE`.
- Map safe `4xx` contract responses without exposing the response body.
- Never retry the intake automatically with a new run ID.
- Do not log the token or request body.

## 8. Analyzer Intake and Queue

### 8.1 Python workspace additions

Add only the Phase 3 dependencies to `apps/analyzer`:

- Dramatiq with Redis support.
- A Redis client if not supplied by the Dramatiq extra.
- `psycopg` with the binary extra for PostgreSQL access.
- An S3-compatible client such as `boto3` for worker object verification.

Use `uv add` or the repository's equivalent so `pyproject.toml` and `uv.lock` remain synchronized. Do not add parser, DNS, GeoIP, reputation or ML dependencies yet.

### 8.2 Internal request contract

Define Pydantic models in `apps/analyzer/app/api/analyses.py`:

```json
{
  "caseId": "case_...",
  "organizationId": "org_...",
  "analysisRunId": "run_...",
  "artifact": {
    "objectKey": "organizations/org_.../cases/case_.../artifacts/art_....eml",
    "sha256": "64 lowercase hex characters",
    "byteSize": 24831
  },
  "requestedAt": "2026-08-29T00:00:00Z",
  "requestId": "req_..."
}
```

Rules:

- Use Pydantic aliases matching the JSON contract and Python names internally.
- Bound string lengths and reject control characters.
- Validate SHA-256 shape and non-negative byte size.
- Validate timestamp timezone awareness.
- Do not accept a browser-originated request; the route is service-only.
- Export deterministic OpenAPI after the endpoint is implemented.

Return:

```json
{
  "analysisRunId": "run_...",
  "status": "queued",
  "acceptedAt": "2026-08-29T00:00:00Z",
  "requestId": "req_..."
}
```

### 8.3 Service authentication

Implement a FastAPI dependency or middleware for the intake route:

1. Read the selected authorization header.
2. Reject missing or malformed credentials with `401`.
3. Compare the supplied token and configured token using constant-time comparison.
4. Never include the token in an exception, log, metric or response.
5. Do not accept organization ID, user ID or role from the authorization header.
6. Keep the endpoint on the internal network in Compose/deployment.

The service token authenticates the web service, not an analyst. The web service has already enforced the analyst role.

### 8.4 Intake relation validation

Before enqueueing, the analyzer must verify through PostgreSQL that:

- `analysis_run_id` exists.
- The run belongs to `organization_id`.
- The run belongs to `case_id`.
- The case belongs to `organization_id`.
- An `original_eml` artifact exists for the case and organization.
- Its object key, SHA-256 and byte size exactly match the request.
- The run is still `queued`.

Return a safe `409` for a stale/duplicate run and a safe `404` or `400` for an invalid relation without confirming inaccessible tenant data.

### 8.5 Dramatiq broker

Create a small broker module, for example `apps/analyzer/app/tasks/broker.py`:

- Read `REDIS_URL` from validated settings.
- Configure `RedisBroker` with a stable queue name such as `mailsentinel.analysis`.
- Add bounded retry middleware with exponential backoff and jitter.
- Cap retries for storage/temporary database failures.
- Do not retry permanent request validation or integrity failures indefinitely.
- Keep broker initialization import-safe for unit tests.
- Expose a health/readiness check that can distinguish Redis failure from provider failure.

### 8.6 Idempotent actor

Create `apps/analyzer/app/tasks/actors.py` with one Phase 3 actor:

```text
process_analysis(organization_id, case_id, analysis_run_id, artifact_reference, request_id)
```

Actor behavior:

1. Load the run and relation by all three IDs.
2. Conditionally claim the queued run; if another worker already claimed/finished it, return without duplicate writes.
3. Retrieve the private object using analyzer credentials.
4. Stream it while recalculating SHA-256 and byte size.
5. Compare both against the database artifact metadata.
6. On mismatch, conditionally mark run/case `failed` with `ARTIFACT_INTEGRITY_MISMATCH` and append a service audit event.
7. On success, do not parse; conditionally mark run/case `analysis_deferred` with `PARSER_NOT_AVAILABLE` and append a service audit event.
8. Preserve the original object without overwriting it.
9. Log only run ID, case ID, organization ID, byte count, duration and safe outcome.

If the worker is not running, the run remains `queued` and the UI must display that it is waiting. If the worker is running, `analysis_deferred` is the truthful terminal Phase 3 state.

### 8.7 FastAPI route

Add `POST /v1/analyses` to the analyzer app:

- Protect it with the service-token dependency.
- Validate the Pydantic request.
- Validate the database relation.
- Send exactly one Dramatiq message for the run.
- Return `202` with the response contract.
- Include a request ID in response headers and body.
- Return safe `409`, `401`, `403`, `422` or `503` errors.
- Do not expose the route to the public browser network.

The existing `/health/live` and `/health/ready` endpoints must continue to work. Readiness may fail for a required Redis/DB dependency, but a future external provider outage must not affect readiness.

## 9. Web Upload and Status UI

### 9.1 Routes

Add:

```text
apps/web/src/app/(protected)/cases/new/page.tsx
apps/web/src/app/api/cases/route.ts
apps/web/src/app/api/cases/[caseId]/route.ts
apps/web/src/app/api/cases/[caseId]/status/route.ts  # optional if projection route is kept separate
```

Use the existing protected layout and `requireWorkspaceContext()`.

The case detail route remains `/cases/[caseId]`. Do not expose an artifact download route in this phase.

### 9.2 New-case page

The server page must:

- Require `case.create`.
- Pass only the non-secret maximum byte limit to the client form.
- Explain accepted `.eml` files, the maximum size and synthetic-data privacy rules.
- Show the current organization name without accepting it as input.
- Avoid rendering any existing message content.

The client upload form must:

- Accept one `.eml` file.
- Reject an incorrect extension, empty file or local size over the limit before sending.
- Generate a new idempotency key for a new attempt.
- Use `XMLHttpRequest` or another supported browser API when upload progress is required.
- Send the exact file bytes as the raw request body.
- Send `X-Original-Filename`, accepted `Content-Type` and `Idempotency-Key`.
- Display byte progress without reading the file into a second full buffer.
- Disable duplicate submission while the request is active.
- Parse only safe error codes.
- On `202`, navigate to `/cases/{caseId}`.
- On `503` with a preserved case ID, navigate to that case and show deferred state.
- On `409 DUPLICATE_ARTIFACT`, show the existing safe case reference and require an explicit confirmation before retrying with `X-Allow-Duplicate: true`.
- Keep the same idempotency key for the duplicate-confirmation retry.
- Never log file bytes, filename-derived content beyond the displayed sanitized name, credentials or response bodies.

### 9.3 Case queue

Update `/cases`:

- Show a `New case` link only for users with `case.create`.
- Keep all rows from `listCases` tenant-scoped.
- Display queued, deferred and failed labels with text and icons, not color alone.
- Do not show risk, verdict or analysis observations.
- Show the safe original filename and receive time only after the upload has been persisted.
- Keep empty-state copy truthful when there are no cases.

### 9.4 Case detail projection

Extend the page/server endpoint to show:

- Case number and title.
- Status and status explanation.
- Original sanitized filename.
- Exact byte size.
- SHA-256 digest in a copyable but non-sensitive metadata block.
- Artifact kind `original_eml`.
- Receive timestamp.
- Analysis run status and safe failure/deferred code.
- A clear note that forensic parsing has not started or is deferred.

Do not show:

- Object storage keys.
- Signed URLs.
- Raw email body or full headers.
- Attachment bytes.
- A verdict or risk score.
- Provider data.

### 9.5 Status polling

Implement a client status component with a server-rendered initial projection:

- Poll the minimized case endpoint every 2-3 seconds while status is `queued`.
- Stop polling for `analysis_deferred` and `failed` in Phase 3.
- Stop polling for all later terminal statuses when Phase 4 adds them.
- Back off after repeated network errors.
- Keep the last known state visible.
- Avoid polling when the document is hidden.
- Never poll an endpoint that returns raw evidence.
- Do not create a `case.viewed` audit event for every poll.

## 10. Audit, Logging and Security Controls

### 10.1 Audit events

Append these events with redacted metadata:

| Event | Actor | When |
|---|---|---|
| `case.created` | user | Case transaction commits. |
| `evidence.uploaded` | user | Original artifact metadata commits. |
| `analysis.queued` | service or user | Analyzer accepts the intake. |
| `analysis.deferred` | service | Analyzer/queue/parser-unavailable path occurs. |
| `analysis.failed` | service | Integrity or permanent worker failure occurs. |
| `case.viewed` | user | Authorized detail page performs its initial data load. |

Metadata may contain safe IDs, status, byte count, hash, mode and duration. It must not contain raw bytes, full headers, body text, passwords, tokens or unredacted IP forwarding chains.

### 10.2 Origin and CSRF protection

The upload route is a cookie-authenticated mutation, so do not rely solely on Better Auth's auth-route CSRF checks:

- Require a same-origin `Origin` for browser upload requests.
- Compare against the configured trusted origin, not a request-supplied host.
- Reject unexpected origins before reading/storing the body.
- Do not disable Better Auth CSRF or origin checks.
- Keep the service-token analyzer route separate from browser cookie auth.

### 10.3 SSRF and path controls

- The upload route contacts only the configured S3/MinIO endpoint and analyzer URL.
- It never contacts a URL from the email body; email body parsing is deferred.
- The analyzer's S3 endpoint comes from server configuration, not a request field.
- Reject object keys supplied by the browser.
- Sanitize the display filename and never concatenate it into a filesystem or object path.
- Do not add remote image, URL preview or attachment rendering behavior.

### 10.4 Logging policy

Allowed fields:

- request ID;
- organization ID;
- case ID;
- analysis run ID;
- stage;
- byte count;
- duration;
- provider/queue status;
- safe error code.

Forbidden fields:

- raw request body;
- full headers;
- original object key in user-facing logs;
- passwords, secrets or service tokens;
- raw S3/Redis/database error payloads;
- complete filenames when they may contain personal data;
- email addresses unless the later forensic display policy permits them.

## 11. Contracts and Generated Types

### 11.1 Analyzer OpenAPI

Make FastAPI the source of truth:

1. Define Pydantic request/response/error models.
2. Export a deterministic `openapi.json`.
3. Add `apps/analyzer` script `contracts:export`.
4. Create `packages/contracts` only if the generated client has a real web consumer.
5. Generate TypeScript types from the exported OpenAPI document.
6. Make the web analyzer client use generated response/request types.
7. Add CI drift detection by regenerating and failing on a diff.

Do not manually duplicate the analyzer response shape in a web-only interface.

### 11.2 Contract error codes

Define a shared list of stable codes for:

- invalid service credentials;
- invalid request relation;
- duplicate/stale run;
- queue unavailable;
- artifact integrity mismatch;
- parser unavailable;
- storage unavailable.

Error messages can change for UX; codes are the machine contract. All messages must be safe for browser display.

## 12. Testing Strategy

### 12.1 TypeScript unit tests

Add tests for:

- filename normalization and path-separator removal;
- `.eml` extension validation;
- accepted/rejected content types;
- idempotency-key validation;
- maximum byte and content-length validation;
- origin validation;
- case-number/title safe projection;
- duplicate-response parsing;
- analyzer timeout/error mapping;
- conditional state transition helpers;
- audit metadata redaction;
- permission checks for viewer/analyst/supervisor/admin.

Use synthetic byte arrays only. Do not put raw private-looking email content in test output.

### 12.2 Object-storage integration tests

With MinIO or an isolated S3-compatible test service:

- Upload a known synthetic byte stream.
- Verify the object exists in the private bucket.
- Verify `ContentLength` matches the counted bytes.
- Re-download the object as a stream and calculate SHA-256.
- Verify the re-downloaded hash matches PostgreSQL metadata.
- Verify the object key contains only the organization, case and artifact IDs.
- Verify no public bucket access is enabled.
- Force a stream failure and confirm multipart cleanup is attempted.
- Send an over-limit stream and confirm no complete artifact row is written.

### 12.3 Database integration tests

Against PostgreSQL 17 with migrations applied:

- New artifact/run/audit tables exist.
- Existing Phase 2 data remains readable.
- Migration is repeatable.
- Idempotency key is unique within an organization and can repeat across organizations.
- Same hash can exist in different organizations.
- Same-organization duplicate lookup returns only that organization's artifact.
- A case/artifact/run transaction rolls back together.
- A committed case remains when queue metadata is later deferred.
- Audit events can be inserted but not updated/deleted through package APIs.
- Conditional run transitions prevent duplicate deferred/failed writes.
- Cross-tenant artifact, run and audit reads return no rows.

### 12.4 Web route integration tests

Mock or use local implementations for S3 and analyzer intake. Test:

- Unauthenticated upload is rejected before reading the body.
- Viewer upload is rejected before reading the body.
- Analyst upload creates one case, artifact, run and initial audit events.
- Supervisor/admin upload is allowed.
- Missing filename, wrong extension and unsupported type return `400`.
- Declared oversized content returns `413` before storage.
- Chunked over-limit content aborts storage and writes no committed artifact.
- Empty content returns `400`.
- S3 failure returns safe `503` and no committed metadata.
- Database failure triggers best-effort object cleanup.
- Analyzer `202` leaves status `queued`.
- Analyzer timeout commits evidence and changes status to `analysis_deferred`.
- Redis/queue failure commits evidence and changes status to `analysis_deferred`.
- Duplicate hash without confirmation returns `409` and cleans temporary storage.
- Duplicate hash with confirmation creates a separate case in the same organization.
- The same idempotency key returns the original case without a second object.
- The same idempotency key with different bytes returns `409`.
- Origin mismatch is rejected before storage.
- Response never contains the object key or raw email bytes.

### 12.5 Analyzer unit/integration tests

Test with fake Redis, PostgreSQL and S3 adapters where appropriate:

- Missing/bad service token returns `401`.
- Valid token is accepted with constant-time comparison path.
- Forged organization/case/run/artifact relationship is rejected.
- Valid relation enqueues one message.
- Duplicate intake does not enqueue a new run.
- Actor ignores a non-queued run.
- Actor detects object size mismatch.
- Actor detects SHA-256 mismatch.
- Actor marks integrity failure safely.
- Actor marks a verified object `analysis_deferred` with `PARSER_NOT_AVAILABLE`.
- Actor retry behavior is bounded.
- Logs contain IDs and counts but not message content or credentials.

### 12.6 End-to-end tests

Extend Playwright with synthetic credentials and a synthetic `.eml` fixture:

1. Sign in as analyst.
2. Open `/cases/new`.
3. Confirm the upload limit and privacy notice are visible.
4. Upload the fixture and observe progress.
5. Confirm navigation to a new case.
6. Confirm the case displays a SHA-256 and byte size.
7. Confirm queued state while the worker is unavailable or deferred state when the safe worker path runs.
8. Confirm no raw message body is rendered.
9. Repeat the same idempotency request and confirm no duplicate case.
10. Upload the same fixture again and confirm the duplicate warning.
11. Confirm a duplicate can be explicitly confirmed within the same organization.
12. Sign in as viewer and confirm the new-case action/upload is unavailable.
13. Attempt an inaccessible case/artifact ID and confirm safe not-found behavior.
14. Test analyzer/queue failure copy without exposing implementation details.

### 12.7 Security and resource tests

Include:

- 25 MiB boundary and 25 MiB + 1 byte.
- Missing or contradictory `Content-Length`.
- Slow/chunked body within timeout policy.
- Malicious filename with path traversal, null/control characters and very long Unicode.
- Unsupported content type with `.eml` extension.
- Invalid/missing origin.
- Invalid/oversized idempotency key.
- Duplicate delivery of the same analyzer request.
- Forged service token.
- Forged organization/case/artifact IDs.
- Cross-tenant duplicate hash and case ID checks.
- Client disconnect after upload commit.
- S3/Redis/PostgreSQL outage.
- Log capture proving raw body/header values are absent.

## 13. Environment and Infrastructure Changes

### 13.1 Web environment

Retain the existing values and add/validate only what Phase 3 needs:

```dotenv
DATABASE_URL=postgresql://mailsentinel:replace-me@localhost:5432/mailsentinel
BETTER_AUTH_SECRET=replace-with-at-least-32-random-bytes
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000
ANALYZER_INTERNAL_URL=http://localhost:8000
ANALYZER_SERVICE_TOKEN=replace-with-local-service-token
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=mailsentinel-evidence
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=true
MAX_EML_BYTES=26214400
UPLOAD_TIMEOUT_MS=120000
ANALYZER_REQUEST_TIMEOUT_MS=3000
RETENTION_DAYS=90
APP_ENV=development
```

Rules:

- `MAX_EML_BYTES` must be a positive bounded integer; do not allow an unlimited setting.
- `UPLOAD_TIMEOUT_MS` must prevent a body from holding a worker indefinitely.
- `ANALYZER_REQUEST_TIMEOUT_MS` applies only to intake acceptance, not analysis duration.
- No new value may use `NEXT_PUBLIC_` unless it is intentionally non-secret, such as a displayed size limit passed by a server component.

### 13.2 Analyzer environment

Retain existing DB, Redis, S3 and token values. Add queue settings:

```dotenv
DATABASE_URL=postgresql://mailsentinel:replace-me@localhost:5432/mailsentinel
REDIS_URL=redis://:replace-me@localhost:6379/0
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=mailsentinel-evidence
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=true
ANALYZER_SERVICE_TOKEN=replace-with-local-service-token
ANALYZER_PORT=8000
ANALYSIS_VERSION=prototype-1
DRAMATIQ_QUEUE_NAME=mailsentinel.analysis
DRAMATIQ_MAX_RETRIES=3
DRAMATIQ_MIN_BACKOFF_MS=1000
DRAMATIQ_MAX_BACKOFF_MS=30000
MAX_EML_BYTES=26214400
ENRICHMENT_MODE=offline
APP_ENV=development
```

Do not put the analyzer service token in a browser environment or expose FastAPI publicly.

### 13.3 Compose

Update the existing `analyzer` and `worker` profile configuration:

- Include the updated `uv.lock` dependencies in the analyzer image.
- Pass the S3, PostgreSQL, Redis and service-token values to both services.
- Ensure `minio-init` completes before any upload/worker integration test.
- Keep analyzer and worker on the private Compose network.
- Keep host bindings local-only.
- Make the worker command run the Dramatiq worker, not the setup placeholder.
- Add health/readiness checks that do not require a forensic job to exist.
- Do not make MinIO public.

Recommended local commands:

```bash
pnpm infra:up
pnpm db:migrate
pnpm dev:analyzer
pnpm --filter @mailsentinel/analyzer dev:worker
pnpm dev:web
```

If the worker is not running, an upload must remain usable and show `queued` or `analysis_deferred` according to the intake result.

## 14. Ordered Execution Workstreams

Do not start a later workstream until its exit criteria pass.

### Workstream A - Freeze contract and migration design

Tasks:

- [ ] Run Phase 2 preflight checks.
- [ ] Create ADR 0005 for upload transport, queue and failure semantics.
- [ ] Confirm raw request-body streaming works with the installed Next.js runtime.
- [ ] Confirm MinIO/S3 multipart behavior and cleanup API.
- [ ] Define artifact, run, audit and idempotency schema changes.
- [ ] Define analyzer Pydantic contract and stable error codes.
- [ ] Define which worker outcome is `analysis_deferred` until Phase 4.

Exit criteria:

- No schema or transport decision is left implicit.
- Web, analyzer and database owners agree on the request/response contract.

### Workstream B - Extend PostgreSQL and repositories

Tasks:

- [ ] Add the idempotency key migration.
- [ ] Add `evidence_artifacts` schema and indexes.
- [ ] Add `analysis_runs` schema and indexes.
- [ ] Add append-only `audit_events` schema and indexes.
- [ ] Generate and review the Drizzle migration.
- [ ] Apply it to clean and existing Phase 2 databases.
- [ ] Add `createCaseIntake` transaction.
- [ ] Add idempotency, duplicate-hash and safe ingestion projections.
- [ ] Add conditional state transition helpers.
- [ ] Add audit insert-only helper.

Exit criteria:

- Migrations are repeatable and contain no destructive unrelated changes.
- A transaction can persist all intake metadata or none of it.
- All repository reads remain tenant-scoped.

### Workstream C - Implement S3/MinIO streaming storage

Tasks:

- [ ] Add AWS S3 client dependencies to the web package.
- [ ] Implement validated server-only S3 client construction.
- [ ] Implement opaque object-key generation.
- [ ] Implement bounded streaming upload with SHA-256 and byte count.
- [ ] Enforce content-length and streaming limits.
- [ ] Verify object metadata after upload.
- [ ] Implement abort/delete cleanup paths.
- [ ] Add object-storage integration tests.

Exit criteria:

- A known synthetic byte stream can be uploaded and re-read with the same hash and size.
- Over-limit and failed streams leave no committed artifact metadata.
- No browser bundle contains storage credentials or object keys.

### Workstream D - Build web intake route

Tasks:

- [ ] Add `POST /api/cases` on the Node runtime.
- [ ] Add origin, session and permission checks before body consumption.
- [ ] Add bounded request-header validation.
- [ ] Add idempotency lookup before storage.
- [ ] Add duplicate hash confirmation flow.
- [ ] Call the transactional case-intake repository.
- [ ] Map storage/database failures to safe responses.
- [ ] Add analyzer-client timeout and error mapping.
- [ ] Add queue-deferred conditional update.

Exit criteria:

- An analyst can create one queued case with one original artifact and one run.
- Retry and duplicate behavior matches the contract.
- Analyzer outage preserves the case and evidence.

### Workstream E - Implement analyzer intake and worker

Tasks:

- [ ] Add Dramatiq/Redis dependencies and lockfile updates.
- [ ] Add Pydantic intake request/response models.
- [ ] Add service-token authentication.
- [ ] Add database relation validation.
- [ ] Add broker initialization and retry configuration.
- [ ] Add the idempotent actor.
- [ ] Add object size/hash verification.
- [ ] Add safe `PARSER_NOT_AVAILABLE` deferred transition.
- [ ] Add service audit events.
- [ ] Update analyzer Docker/Compose commands.

Exit criteria:

- Valid intake requests enqueue exactly one run.
- Invalid credentials and forged relationships are rejected.
- Worker restart or duplicate delivery cannot create duplicate state.
- No actor claims a verdict before Phase 4.

### Workstream F - Add upload UI and status projection

Tasks:

- [ ] Add `/cases/new` under the existing protected layout.
- [ ] Add upload progress and local validation.
- [ ] Add duplicate confirmation UX.
- [ ] Add `New case` navigation based on server-side permission.
- [ ] Extend case list safe metadata.
- [ ] Add case ingestion projection endpoint.
- [ ] Add status polling with backoff/visibility handling.
- [ ] Add queued/deferred/failed copy and loading states.
- [ ] Keep raw email content and object keys out of the UI.

Exit criteria:

- Analyst can upload without developer tools.
- UI explains what was preserved and what has not been analyzed.
- Viewer cannot reach or submit the upload flow.

### Workstream G - Contracts, tests and documentation

Tasks:

- [ ] Export and generate the analyzer OpenAPI contract.
- [ ] Add unit, database, storage, route and analyzer tests.
- [ ] Add the Playwright upload flow.
- [ ] Add outage, duplicate, idempotency and integrity tests.
- [ ] Update CI with PostgreSQL, Redis and MinIO test services.
- [ ] Update README and developer setup commands.
- [ ] Document synthetic transport fixture provenance.
- [ ] Run the verification sequence twice.

Exit criteria:

- Required Phase 3 tests pass from a clean checkout.
- CI does not silently skip database/storage/queue integration coverage.
- The Phase 4 parser receives a stable artifact/run contract.

## 15. Verification Sequence

Run each stage in order and preserve failures for diagnosis.

### 15.1 Static and dependency checks

```bash
pnpm install --frozen-lockfile
uv sync --locked --project apps/analyzer
pnpm format:check
pnpm lint
pnpm typecheck
```

Confirm generated OpenAPI and generated TypeScript types are deterministic if the contracts package is enabled.

### 15.2 Migration and seed checks

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:check
pnpm db:seed
pnpm db:migrate
pnpm db:seed
```

Verify:

- Existing Phase 2 users and memberships still work.
- New tables exist.
- Second migration is a no-op.
- Second seed creates no duplicate identity or tenancy rows.
- Normal seed still contains no cases unless a separate demo upload is explicitly run.

### 15.3 Storage check

Use a synthetic `.eml` fixture and verify:

- Private bucket is reachable.
- Upload stream completes.
- PostgreSQL byte size equals the received byte count.
- PostgreSQL SHA-256 equals the re-downloaded object SHA-256.
- Object key uses opaque IDs.
- No public read is possible.
- Temporary objects are removed after duplicate rejection or transaction failure.

### 15.4 Analyzer/queue check

Start the analyzer and worker:

```bash
pnpm dev:analyzer
pnpm --filter @mailsentinel/analyzer dev:worker
```

Verify:

```bash
curl --fail http://localhost:8000/health/live
curl --fail http://localhost:8000/health/ready
```

Then test:

- Missing token -> `401`.
- Wrong token -> `401`.
- Valid relation -> `202` and one Redis message.
- Duplicate run -> no second message.
- Worker validates object hash/size.
- Worker ends at `analysis_deferred` with `PARSER_NOT_AVAILABLE`.

### 15.5 Web flow check

Start the web application:

```bash
pnpm dev:web
```

Verify:

1. Anonymous `/cases/new` redirects to `/sign-in`.
2. Viewer cannot access the upload action.
3. Analyst can open `/cases/new`.
4. Invalid file is rejected locally and server-side.
5. Oversized file is rejected without a committed object.
6. Valid synthetic `.eml` shows upload progress.
7. Successful upload returns a case ID quickly.
8. Case detail shows hash, byte size and queued/deferred state.
9. Raw body, full headers and object key are absent from the page.
10. Analyzer outage leaves the case available with `analysis_deferred`.
11. Same idempotency key returns the original case.
12. Same hash requires explicit duplicate confirmation.
13. A cross-tenant case/artifact ID behaves as not found.

### 15.6 Automated checks

```bash
pnpm test
TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @mailsentinel/db test
TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @mailsentinel/auth test
pnpm test:e2e
pnpm build
```

Run integration tests with real PostgreSQL/Redis/MinIO in CI. Do not mark a skipped integration suite as Phase 3 verification.

### 15.7 Repeatability and cleanup

- Run the same upload twice with the same idempotency key.
- Run the same upload twice with different keys and confirm duplicate behavior.
- Stop the worker while an upload is accepted; confirm the case remains queued.
- Stop Redis during intake; confirm evidence is preserved and run is deferred.
- Stop MinIO during upload; confirm no committed artifact row exists.
- Restart the worker and confirm no duplicate state is written.
- Reset only disposable local data when intentionally testing clean migrations.
- Confirm `git diff --check` and no populated environment files are tracked.

## 16. Phase 3 Acceptance Checklist

### Intake authorization

- [ ] Anonymous users cannot upload.
- [ ] Viewers cannot upload.
- [ ] Analysts, supervisors and admins can upload.
- [ ] Session and membership are resolved by Phase 2 server code.
- [ ] Origin validation runs before body storage.
- [ ] Organization/user/role values are never trusted from the browser.

### Validation and preservation

- [ ] Only bounded `.eml` uploads are accepted.
- [ ] Filename is sanitized and cannot create a path traversal.
- [ ] Content type is checked but not treated as proof of message validity.
- [ ] Known oversized requests are rejected before storage.
- [ ] Chunked oversized requests abort safely.
- [ ] Empty uploads are rejected.
- [ ] SHA-256 is calculated from exact received bytes.
- [ ] Stored object size and hash are verified.
- [ ] Original object is immutable and stored privately.
- [ ] Object key contains no sender, subject or raw filename.

### Database and audit

- [ ] Case, artifact and analysis run are created transactionally.
- [ ] Original filename, byte size, hash, object metadata, receive time and submitting user are recorded safely.
- [ ] Retention deadline is populated from validated configuration.
- [ ] `case.created` and `evidence.uploaded` events are appended.
- [ ] Queue/deferred/failure events are appended with service identity.
- [ ] Audit helpers do not expose update/delete behavior.
- [ ] All artifact/run/audit reads are tenant-scoped.

### Duplicate and retry safety

- [ ] Same idempotency key returns the same case within one organization.
- [ ] Same key with different bytes is rejected.
- [ ] Same hash in the same organization requires explicit confirmation.
- [ ] Same hash in another organization does not affect the response.
- [ ] Temporary objects are cleaned after duplicate rejection.
- [ ] Client disconnect/retry does not create duplicate metadata.

### Analyzer and queue

- [ ] FastAPI intake requires the internal service token.
- [ ] Token comparison is constant-time and never logged.
- [ ] Request relation validation prevents forged case/artifact/run combinations.
- [ ] Valid request returns `202` quickly.
- [ ] Dramatiq message identity is tied to `analysis_run_id`.
- [ ] Worker delivery is idempotent.
- [ ] Worker verifies object size/hash before later parser work.
- [ ] Queue/storage/analyzer outage preserves evidence.
- [ ] Phase 3 never creates a verdict or claims `completed`.

### Web experience

- [ ] `/cases/new` is protected and role-aware.
- [ ] Upload progress, loading, duplicate, deferred and failure states are understandable.
- [ ] Case detail displays safe chain-of-custody metadata.
- [ ] Status polling stops/backoffs correctly.
- [ ] Raw email content, full headers and object keys are not rendered.
- [ ] UI is usable on mobile, tablet and desktop widths.
- [ ] Keyboard navigation and focus states work.

### Quality

- [ ] Unit, database, storage, analyzer and browser tests pass.
- [ ] CI runs disposable PostgreSQL, Redis and MinIO-backed integration coverage.
- [ ] OpenAPI generation is deterministic and drift-checked.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- [ ] No secret, raw message, provider response or populated environment file is committed.
- [ ] README, development setup and ADR document the Phase 3 commands and limitations.

## 17. Handoff To Phase 4

Phase 4 may begin only after the Phase 3 acceptance checklist passes.

Phase 4 must reuse:

- The existing `evidence_artifacts` original object and verified SHA-256.
- The `analysis_runs` row and `analysis_run_id` idempotency identity.
- The persisted `queued`/`analysis_deferred` lifecycle.
- The authenticated analyzer contract and worker broker.
- The safe object retrieval and integrity-verification helper.
- The tenant-scoped repository and audit helper.
- The case status polling/projection contract.

Phase 4 may replace only the safe deferred worker body with parser stages:

```text
verified original object
  -> safe MIME parser
  -> extraction observations
  -> persisted warnings and metadata
```

Phase 4 must not:

- Reimplement upload or hash calculation.
- Trust an object key or organization ID from a browser.
- Modify the original object.
- Treat an unverified artifact as parser input.
- Put raw email content in logs or unrestricted web responses.
- Skip the existing `analysis_run_id` idempotency checks.

The next phase is successful only when evidence preservation remains true even when parsing, storage, Redis or analyzer dependencies fail.
