# Analyzer application package

Phase 3 contains the authenticated intake contract under `api/analyses.py`, a
PostgreSQL relation/state repository, a streaming S3 verifier, and the
Dramatiq/Redis queue actor. No parser, enrichment, scoring, verdict or raw
message rendering belongs in this phase.
