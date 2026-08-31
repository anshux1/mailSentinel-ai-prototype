from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import dramatiq
from pydantic import ValidationError

from app.api.analyses import AnalysisIntakeRequest, ArtifactReference
from app.core.config import Settings, get_settings
from app.services.repository import AnalysisRelation, AnalysisRepository, PostgresAnalysisRepository
from app.storage.s3 import ArtifactIntegrityMismatch, create_s3_client, verify_s3_object
from app.tasks.broker import broker_for, send_message

logger = logging.getLogger("mailsentinel.worker")


# These factories are intentionally replaceable in tests. Neither construction
# path connects to a service until an actor actually runs.
def repository_factory(settings: Settings) -> AnalysisRepository:
    return PostgresAnalysisRepository(settings.database_url)


def s3_client_factory(settings: Settings) -> Any:
    return create_s3_client(settings)


@contextmanager
def _claim_context(repository: AnalysisRepository, relation: AnalysisRelation) -> Iterator[bool]:
    """Use a database advisory lock when the concrete repository provides one."""
    claim = getattr(repository, "claim_queued", None)
    if callable(claim):
        with claim(relation) as claimed:
            yield bool(claimed)
        return
    # Small fakes used by unit tests can omit the lock; terminal updates still
    # use conditional predicates in the real repository.
    yield relation.status == "queued"


@dramatiq.actor(queue_name="mailsentinel.analysis")
def process_analysis(
    organization_id: str,
    case_id: str,
    analysis_run_id: str,
    artifact_reference: dict[str, object],
    request_id: str,
) -> None:
    """Verify preserved evidence, then defer until the Phase 4 parser exists."""
    started = time.monotonic()
    settings = get_settings()
    try:
        artifact = ArtifactReference.model_validate(artifact_reference)
        payload = AnalysisIntakeRequest(
            case_id=case_id,
            organization_id=organization_id,
            analysis_run_id=analysis_run_id,
            artifact=artifact,
            requested_at=datetime.now(UTC),
            request_id=request_id,
        )
    except (ValidationError, TypeError, ValueError):
        # A malformed broker message is permanent and is not allowed to trigger
        # unbounded retries. No evidence content is logged.
        logger.error("analysis job rejected: invalid message", extra={"stage": "intake"})
        return

    repository = repository_factory(settings)
    relation = repository.validate_relation(payload)
    if relation is None or relation.organization_id != organization_id:
        logger.error(
            "analysis job rejected: invalid relation",
            extra={"stage": "relation", "analysis_run_id": analysis_run_id},
        )
        return

    with _claim_context(repository, relation) as claimed:
        if not claimed:
            logger.info(
                "analysis job skipped: run is no longer queued or is already claimed",
                extra={"stage": "deduplication", "analysis_run_id": analysis_run_id},
            )
            return

        try:
            verified = verify_s3_object(
                s3_client_factory(settings),
                settings,
                object_key=relation.object_key,
                expected_sha256=relation.sha256,
                expected_byte_size=relation.byte_size,
            )
        except ArtifactIntegrityMismatch:
            repository.mark_analysis_deferred(
                relation,
                failure_code="ARTIFACT_INTEGRITY_MISMATCH",
                safe_message="The preserved evidence failed its integrity check.",
                request_id=request_id,
            )
            logger.warning(
                "analysis job deferred: artifact integrity mismatch",
                extra={
                    "stage": "verification",
                    "organization_id": organization_id,
                    "case_id": case_id,
                    "analysis_run_id": analysis_run_id,
                },
            )
            return
        except OSError:
            repository.mark_analysis_deferred(
                relation,
                failure_code="STORAGE_UNAVAILABLE",
                safe_message="The preserved evidence could not be read from storage.",
                request_id=request_id,
            )
            logger.warning(
                "analysis job deferred: storage unavailable",
                extra={
                    "stage": "verification",
                    "organization_id": organization_id,
                    "case_id": case_id,
                    "analysis_run_id": analysis_run_id,
                },
            )
            return

        # No parser, extractor, enrichment or scoring is called in Phase 3.
        repository.mark_analysis_deferred(
            relation,
            failure_code="PARSER_NOT_AVAILABLE",
            safe_message="Forensic parsing is not available in this phase.",
            request_id=request_id,
        )
        logger.info(
            "analysis job deferred: parser unavailable",
            extra={
                "stage": "deferred",
                "organization_id": organization_id,
                "case_id": case_id,
                "analysis_run_id": analysis_run_id,
                "byte_count": verified.byte_size,
                "duration_ms": int((time.monotonic() - started) * 1000),
            },
        )


def enqueue_analysis(
    payload: AnalysisIntakeRequest,
    relation: AnalysisRelation,
    settings: Settings,
) -> None:
    """Publish one idempotent job after the broker has been configured."""
    broker_for(settings)
    send_message(
        lambda: process_analysis.send_with_options(
            args=(
                relation.organization_id,
                relation.case_id,
                relation.analysis_run_id,
                payload.artifact.model_dump(mode="json"),
                payload.request_id,
            ),
            queue_name=settings.dramatiq_queue_name,
        )
    )
