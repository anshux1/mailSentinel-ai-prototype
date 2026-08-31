from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

if TYPE_CHECKING:
    from app.api.analyses import AnalysisIntakeRequest


class RepositoryError(RuntimeError):
    """Base class for safe repository failures."""


class RelationNotFoundError(RepositoryError):
    pass


class StaleRunError(RepositoryError):
    pass


class QueueAuditError(RepositoryError):
    pass


@dataclass(frozen=True, slots=True)
class AnalysisRelation:
    organization_id: str
    case_id: str
    analysis_run_id: str
    object_key: str
    sha256: str
    byte_size: int
    status: str


class AnalysisRepository(Protocol):
    def validate_relation(self, payload: AnalysisIntakeRequest) -> AnalysisRelation | None: ...

    def enqueue_once(
        self,
        relation: AnalysisRelation,
        enqueue: Callable[[], None],
        *,
        request_id: str,
    ) -> bool: ...

    @contextmanager
    def claim_queued(self, relation: AnalysisRelation) -> Iterator[bool]: ...

    def mark_analysis_deferred(
        self,
        relation: AnalysisRelation,
        *,
        failure_code: str,
        safe_message: str,
        request_id: str,
    ) -> bool: ...
    def mark_analysis_failed(
        self,
        relation: AnalysisRelation,
        *,
        failure_code: str,
        safe_message: str,
        request_id: str,
    ) -> bool: ...


class PostgresAnalysisRepository:
    """Narrow analyzer-side repository with tenant predicates on every query."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    @contextmanager
    def _connection(self) -> Iterator[psycopg.Connection[dict[str, Any]]]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            yield connection

    @staticmethod
    def _relation_query() -> str:
        return """
            SELECT
                r.id AS analysis_run_id,
                r.organization_id AS run_organization_id,
                r.case_id AS run_case_id,
                r.status AS run_status,
                a.object_key,
                a.sha256,
                a.byte_size
            FROM analysis_runs AS r
            JOIN cases AS c
              ON c.id = r.case_id
             AND c.organization_id = r.organization_id
            JOIN evidence_artifacts AS a
              ON a.case_id = c.id
             AND a.organization_id = c.organization_id
             AND a.kind = 'original_eml'
            WHERE r.id = %(run_id)s
              AND r.organization_id = %(organization_id)s
              AND r.case_id = %(case_id)s
            ORDER BY a.created_at ASC
            LIMIT 1
        """

    def validate_relation(self, payload: AnalysisIntakeRequest) -> AnalysisRelation | None:
        with self._connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    self._relation_query(),
                    {
                        "run_id": payload.analysis_run_id,
                        "organization_id": payload.organization_id,
                        "case_id": payload.case_id,
                    },
                )
                row = cursor.fetchone()

        if row is None:
            return None
        if (
            row["object_key"] != payload.artifact.object_key
            or row["sha256"] != payload.artifact.sha256
            or row["byte_size"] != payload.artifact.byte_size
        ):
            return None
        return AnalysisRelation(
            organization_id=str(row["run_organization_id"]),
            case_id=str(row["run_case_id"]),
            analysis_run_id=str(row["analysis_run_id"]),
            object_key=str(row["object_key"]),
            sha256=str(row["sha256"]),
            byte_size=int(row["byte_size"]),
            status=str(row["run_status"]),
        )

    @contextmanager
    def claim_queued(self, relation: AnalysisRelation) -> Iterator[bool]:
        """Serialize duplicate deliveries without adding a processing state."""
        with self._connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS acquired",
                    (relation.analysis_run_id,),
                )
                acquired_row = cursor.fetchone()
                acquired = bool(acquired_row and acquired_row["acquired"])
                if not acquired:
                    yield False
                    return
                cursor.execute(
                    """
                    SELECT status
                    FROM analysis_runs
                    WHERE id = %(run_id)s
                      AND organization_id = %(organization_id)s
                      AND case_id = %(case_id)s
                    """,
                    {
                        "run_id": relation.analysis_run_id,
                        "organization_id": relation.organization_id,
                        "case_id": relation.case_id,
                    },
                )
                row = cursor.fetchone()
                yield row is not None and str(row["status"]) == "queued"

    def enqueue_once(
        self,
        relation: AnalysisRelation,
        enqueue: Callable[[], None],
        *,
        request_id: str,
    ) -> bool:
        """Record the queue acceptance under a row lock before releasing it.

        Dramatiq has at-least-once delivery.  The tenant-scoped audit marker is
        also used as the intake idempotency marker, so a repeated HTTP request
        does not publish a second message for the same run.  The actor remains
        idempotent for broker redelivery.
        """
        with self._connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT status
                    FROM analysis_runs
                    WHERE id = %(run_id)s
                      AND organization_id = %(organization_id)s
                      AND case_id = %(case_id)s
                    FOR UPDATE
                    """,
                    {
                        "run_id": relation.analysis_run_id,
                        "organization_id": relation.organization_id,
                        "case_id": relation.case_id,
                    },
                )
                row = cursor.fetchone()
                if row is None:
                    raise RelationNotFoundError
                if str(row["status"]) != "queued":
                    raise StaleRunError

                cursor.execute(
                    """
                    SELECT 1
                    FROM audit_events
                    WHERE organization_id = %(organization_id)s
                      AND case_id = %(case_id)s
                      AND target_type = 'analysis_run'
                      AND target_id = %(run_id)s
                      AND action = 'analysis.queued'
                    LIMIT 1
                    """,
                    {
                        "organization_id": relation.organization_id,
                        "case_id": relation.case_id,
                        "run_id": relation.analysis_run_id,
                    },
                )
                if cursor.fetchone() is not None:
                    return False

                try:
                    enqueue()
                except Exception as exc:
                    raise QueueAuditError from exc

                self._insert_audit(
                    cursor,
                    organization_id=relation.organization_id,
                    actor_id="analyzer",
                    action="analysis.queued",
                    case_id=relation.case_id,
                    target_type="analysis_run",
                    target_id=relation.analysis_run_id,
                    request_id=request_id,
                    metadata={"status": "queued", "analysisRunId": relation.analysis_run_id},
                )
        return True

    def mark_analysis_deferred(
        self,
        relation: AnalysisRelation,
        *,
        failure_code: str,
        safe_message: str,
        request_id: str,
    ) -> bool:
        return self._mark_terminal(
            relation,
            status="analysis_deferred",
            failure_code=failure_code,
            safe_message=safe_message,
            action="analysis.deferred",
            request_id=request_id,
        )

    def mark_analysis_failed(
        self,
        relation: AnalysisRelation,
        *,
        failure_code: str,
        safe_message: str,
        request_id: str,
    ) -> bool:
        return self._mark_terminal(
            relation,
            status="failed",
            failure_code=failure_code,
            safe_message=safe_message,
            action="analysis.failed",
            request_id=request_id,
        )

    def _mark_terminal(
        self,
        relation: AnalysisRelation,
        *,
        status: str,
        failure_code: str,
        safe_message: str,
        action: str,
        request_id: str,
    ) -> bool:
        with self._connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE analysis_runs
                    SET status = %(status)s,
                        failure_code = %(failure_code)s,
                        failure_message_safe = %(safe_message)s,
                        completed_at = CASE
                            WHEN %(status)s = 'failed' THEN CURRENT_TIMESTAMP
                            ELSE NULL
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %(run_id)s
                      AND organization_id = %(organization_id)s
                      AND case_id = %(case_id)s
                      AND status = 'queued'
                    RETURNING id
                    """,
                    {
                        "status": status,
                        "failure_code": failure_code,
                        "safe_message": safe_message[:500],
                        "run_id": relation.analysis_run_id,
                        "organization_id": relation.organization_id,
                        "case_id": relation.case_id,
                    },
                )
                changed = cursor.fetchone() is not None
                if not changed:
                    return False

                cursor.execute(
                    """
                    UPDATE cases
                    SET status = %(status)s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %(case_id)s
                      AND organization_id = %(organization_id)s
                      AND status = 'queued'
                    """,
                    {
                        "status": status,
                        "case_id": relation.case_id,
                        "organization_id": relation.organization_id,
                    },
                )
                self._insert_audit(
                    cursor,
                    organization_id=relation.organization_id,
                    actor_id="analyzer",
                    action=action,
                    case_id=relation.case_id,
                    target_type="analysis_run",
                    target_id=relation.analysis_run_id,
                    request_id=request_id,
                    metadata={
                        "status": status,
                        "failureCode": failure_code,
                    },
                )
        return True

    @staticmethod
    def _insert_audit(
        cursor: Any,
        *,
        organization_id: str,
        actor_id: str,
        action: str,
        case_id: str,
        target_type: str,
        target_id: str,
        request_id: str,
        metadata: dict[str, object],
    ) -> None:
        # UUID generation in the service avoids depending on a database
        # extension; the value is opaque and contains no evidence data.
        import uuid

        cursor.execute(
            """
            INSERT INTO audit_events (
                id, organization_id, actor_type, actor_id, action, case_id,
                target_type, target_id, request_id, metadata_redacted, created_at
            ) VALUES (
                %(id)s, %(organization_id)s, 'service', %(actor_id)s, %(action)s,
                %(case_id)s, %(target_type)s, %(target_id)s, %(request_id)s,
                %(metadata)s, CURRENT_TIMESTAMP
            )
            """,
            {
                "id": f"audit_{uuid.uuid4().hex}",
                "organization_id": organization_id,
                "actor_id": actor_id,
                "action": action,
                "case_id": case_id,
                "target_type": target_type,
                "target_id": target_id,
                "request_id": request_id,
                "metadata": Jsonb(metadata),
            },
        )
