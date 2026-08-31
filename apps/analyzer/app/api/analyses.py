from __future__ import annotations

import hmac
import re
import secrets
from datetime import UTC, datetime
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, field_validator
from pydantic.alias_generators import to_camel

from app.core.config import Settings
from app.services.repository import (
    AnalysisRelation,
    AnalysisRepository,
    PostgresAnalysisRepository,
    QueueAuditError,
    RelationNotFoundError,
    StaleRunError,
)
from app.tasks.broker import QueueUnavailable

router = APIRouter(prefix="/v1/analyses", tags=["analyses"])

# These are deliberately stable: the web application uses them to choose safe copy.
ErrorCode = Literal[
    "INVALID_SERVICE_CREDENTIALS",
    "INVALID_REQUEST_RELATION",
    "DUPLICATE_OR_STALE_RUN",
    "QUEUE_UNAVAILABLE",
    "STORAGE_UNAVAILABLE",
    "ARTIFACT_INTEGRITY_MISMATCH",
    "PARSER_NOT_AVAILABLE",
]

_ID_RE = re.compile(r"^[^\x00-\x1f\x7f]{1,256}$")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


class ArtifactReference(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    object_key: str = Field(min_length=1, max_length=512)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    byte_size: NonNegativeInt = Field(le=26_214_400)

    @field_validator("object_key")
    @classmethod
    def validate_object_key(cls, value: str) -> str:
        if not _ID_RE.fullmatch(value):
            raise ValueError("object_key contains control characters or is empty")
        return value


class AnalysisIntakeRequest(BaseModel):
    """Authenticated web-to-analyzer intake contract.

    The artifact reference is never accepted from a browser.  The service token
    and the relation check in PostgreSQL are what make this reference trusted.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    case_id: str = Field(min_length=1, max_length=128)
    organization_id: str = Field(min_length=1, max_length=128)
    analysis_run_id: str = Field(min_length=1, max_length=128)
    artifact: ArtifactReference
    requested_at: datetime
    request_id: str = Field(min_length=1, max_length=128)

    @field_validator("case_id", "organization_id", "analysis_run_id")
    @classmethod
    def validate_ids(cls, value: str) -> str:
        if not _ID_RE.fullmatch(value):
            raise ValueError("identifier contains control characters")
        return value

    @field_validator("request_id")
    @classmethod
    def validate_request_id(cls, value: str) -> str:
        if not _REQUEST_ID_RE.fullmatch(value):
            raise ValueError("request_id has an invalid format")
        return value

    @field_validator("requested_at")
    @classmethod
    def validate_requested_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("requested_at must include a timezone")
        return value.astimezone(UTC)


class AnalysisAcceptedResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    analysis_run_id: str
    status: Literal["queued"]
    accepted_at: datetime
    request_id: str


class AnalysisErrorResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    code: ErrorCode
    message: str
    request_id: str
    case_id: str | None = None


class AnalysisAPIError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int,
        request_id: str | None = None,
        case_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.request_id = request_id
        self.case_id = case_id


def _new_request_id() -> str:
    return f"req_{secrets.token_hex(12)}"


def _request_id(request: Request) -> str:
    existing = request.headers.get("X-Request-ID", "")
    if _REQUEST_ID_RE.fullmatch(existing):
        return existing
    generated = _new_request_id()
    request.state.request_id = generated
    return generated


def _settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def require_service_token(request: Request) -> None:
    """Authenticate service-to-service calls without leaking token details."""
    request_id = _request_id(request)
    configured = _settings(request).analyzer_service_token
    expected = configured.get_secret_value() if configured else ""

    authorization = request.headers.get("Authorization", "")
    scheme, separator, supplied = authorization.partition(" ")
    # Compare even for a malformed/missing credential, using an equal-shape
    # dummy value where needed.  The result is never included in the response.
    candidate = supplied if separator and scheme.lower() == "bearer" else ""
    token_matches = hmac.compare_digest(candidate, expected)
    if not expected or not token_matches:
        raise AnalysisAPIError(
            "INVALID_SERVICE_CREDENTIALS",
            "Service authentication is required.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            request_id=request_id,
        )


def _repository(request: Request) -> AnalysisRepository:
    configured = getattr(request.app.state, "analysis_repository", None)
    if configured is not None:
        return cast(AnalysisRepository, configured)
    return PostgresAnalysisRepository(_settings(request).database_url)


def _queue(request: Request, payload: AnalysisIntakeRequest, relation: AnalysisRelation) -> None:
    configured = getattr(request.app.state, "enqueue_analysis", None)
    if configured is not None:
        configured(payload, relation)
        return
    from app.tasks.actors import enqueue_analysis

    enqueue_analysis(payload, relation, _settings(request))


def _safe_intake_error(request_id: str, case_id: str | None = None) -> AnalysisAPIError:
    return AnalysisAPIError(
        "QUEUE_UNAVAILABLE",
        "Analysis intake is temporarily unavailable; the evidence was preserved."
        if case_id
        else "Analysis intake is temporarily unavailable.",
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        request_id=request_id,
        case_id=case_id,
    )


@router.post(
    "",
    response_model=AnalysisAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        401: {"model": AnalysisErrorResponse},
        404: {"model": AnalysisErrorResponse},
        409: {"model": AnalysisErrorResponse},
        422: {"model": AnalysisErrorResponse},
        503: {"model": AnalysisErrorResponse},
    },
)
def create_analysis(
    payload: AnalysisIntakeRequest,
    request: Request,
    response: Response,
    _: Annotated[None, Depends(require_service_token)],
) -> AnalysisAcceptedResponse:
    request_id = payload.request_id
    response.headers["X-Request-ID"] = request_id
    repository = _repository(request)

    try:
        relation = repository.validate_relation(payload)
    except Exception as exc:
        # Database exceptions are intentionally not returned or logged with their
        # payload: they may contain connection details and query parameters.
        raise _safe_intake_error(request_id) from exc

    if relation is None:
        raise AnalysisAPIError(
            "INVALID_REQUEST_RELATION",
            "The analysis request does not refer to a valid intake.",
            status_code=status.HTTP_404_NOT_FOUND,
            request_id=request_id,
        )
    if relation.status != "queued":
        raise AnalysisAPIError(
            "DUPLICATE_OR_STALE_RUN",
            "The analysis run is no longer accepting intake.",
            status_code=status.HTTP_409_CONFLICT,
            request_id=request_id,
        )

    try:
        enqueued = repository.enqueue_once(
            relation,
            lambda: _queue(request, payload, relation),
            request_id=request_id,
        )
    except (QueueUnavailable, QueueAuditError, RelationNotFoundError, StaleRunError) as exc:
        if isinstance(exc, (RelationNotFoundError, StaleRunError)):
            raise AnalysisAPIError(
                "DUPLICATE_OR_STALE_RUN",
                "The analysis run is no longer accepting intake.",
                status_code=status.HTTP_409_CONFLICT,
                request_id=request_id,
            ) from exc
        try:
            repository.mark_analysis_deferred(
                relation,
                failure_code="QUEUE_UNAVAILABLE",
                safe_message="Analysis intake is temporarily unavailable.",
                request_id=request_id,
            )
        except Exception:
            # The committed case and artifact remain the source of truth even if
            # this best-effort state update is unavailable.
            pass
        raise _safe_intake_error(request_id, relation.case_id) from exc
    except Exception as exc:
        try:
            repository.mark_analysis_deferred(
                relation,
                failure_code="QUEUE_UNAVAILABLE",
                safe_message="Analysis intake is temporarily unavailable.",
                request_id=request_id,
            )
        except Exception:
            pass
        raise _safe_intake_error(request_id, relation.case_id) from exc

    if not enqueued:
        response.headers["Idempotent-Replay"] = "true"

    return AnalysisAcceptedResponse(
        analysis_run_id=relation.analysis_run_id,
        status="queued",
        accepted_at=datetime.now(UTC),
        request_id=request_id,
    )
