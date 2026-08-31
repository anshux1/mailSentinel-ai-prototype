from __future__ import annotations

import hashlib
from typing import Any

import pytest

from app.core.config import Settings
from app.services.repository import AnalysisRelation
from app.storage.s3 import ArtifactIntegrityMismatch
from app.tasks import actors


class Body:
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.closed = False

    def iter_chunks(self, chunk_size: int = 1024 * 1024) -> list[bytes]:
        return self.chunks

    def close(self) -> None:
        self.closed = True


class S3:
    def __init__(self, body: Body, *, declared_size: int | None = None) -> None:
        self.body = body
        self.declared_size = (
            declared_size if declared_size is not None else sum(map(len, body.chunks))
        )

    def get_object(self, **kwargs: object) -> dict[str, Any]:
        return {"ContentLength": self.declared_size, "Body": self.body}


class Repository:
    def __init__(self, relation: AnalysisRelation) -> None:
        self.relation = relation
        self.failed: list[str] = []
        self.deferred: list[str] = []

    def validate_relation(self, payload: object) -> AnalysisRelation:
        return self.relation

    def mark_analysis_failed(self, relation: AnalysisRelation, **kwargs: str) -> bool:
        self.failed.append(kwargs["failure_code"])
        return True

    def mark_analysis_deferred(self, relation: AnalysisRelation, **kwargs: str) -> bool:
        self.deferred.append(kwargs["failure_code"])
        return True


def make_settings() -> Settings:
    return Settings(
        app_env="test",
        analyzer_service_token="x" * 32,
        database_url="postgresql://user:pass@localhost/db",
        redis_url="redis://localhost/0",
        s3_endpoint="http://localhost:9000",
        s3_access_key_id="access",
        s3_secret_access_key="secret",
    )


def make_relation(content: bytes) -> AnalysisRelation:
    return AnalysisRelation(
        organization_id="org_1",
        case_id="case_1",
        analysis_run_id="run_1",
        object_key="organizations/org_1/cases/case_1/artifacts/art_1.eml",
        sha256=hashlib.sha256(content).hexdigest(),
        byte_size=len(content),
        status="queued",
    )


def test_worker_defers_verified_object_without_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    content = b"synthetic evidence"
    relation = make_relation(content)
    repository = Repository(relation)
    monkeypatch.setattr(actors, "get_settings", make_settings)
    monkeypatch.setattr(actors, "repository_factory", lambda settings: repository)
    monkeypatch.setattr(actors, "s3_client_factory", lambda settings: S3(Body([content])))

    actors.process_analysis.fn(
        "org_1",
        "case_1",
        "run_1",
        {
            "objectKey": relation.object_key,
            "sha256": relation.sha256,
            "byteSize": relation.byte_size,
        },
        "req_1",
    )

    assert repository.deferred == ["PARSER_NOT_AVAILABLE"]
    assert repository.failed == []


def test_worker_defers_when_storage_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    content = b"synthetic evidence"
    relation = make_relation(content)
    repository = Repository(relation)
    monkeypatch.setattr(actors, "get_settings", make_settings)
    monkeypatch.setattr(actors, "repository_factory", lambda settings: repository)
    monkeypatch.setattr(
        actors,
        "s3_client_factory",
        lambda settings: (_ for _ in ()).throw(OSError("storage unavailable")),
    )

    actors.process_analysis.fn(
        "org_1",
        "case_1",
        "run_1",
        {
            "objectKey": relation.object_key,
            "sha256": relation.sha256,
            "byteSize": relation.byte_size,
        },
        "req_1",
    )

    assert repository.deferred == ["STORAGE_UNAVAILABLE"]
    assert repository.failed == []


def test_worker_marks_size_mismatch_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = b"expected"
    relation = make_relation(expected)
    repository = Repository(relation)
    monkeypatch.setattr(actors, "get_settings", make_settings)
    monkeypatch.setattr(actors, "repository_factory", lambda settings: repository)
    monkeypatch.setattr(actors, "s3_client_factory", lambda settings: S3(Body([b"other"])))

    actors.process_analysis.fn(
        "org_1",
        "case_1",
        "run_1",
        {
            "objectKey": relation.object_key,
            "sha256": relation.sha256,
            "byteSize": relation.byte_size,
        },
        "req_1",
    )

    assert repository.failed == []
    assert repository.deferred == ["ARTIFACT_INTEGRITY_MISMATCH"]


def test_storage_verification_rejects_metadata_mismatch() -> None:
    from app.storage.s3 import verify_s3_object

    content = b"synthetic evidence"
    relation = make_relation(content)

    class WrongMetadataS3(S3):
        def get_object(self, **kwargs: object) -> dict[str, Any]:
            result = super().get_object(**kwargs)
            result["Metadata"] = {"sha256": "0" * 64}
            return result

    with pytest.raises(ArtifactIntegrityMismatch):
        verify_s3_object(
            WrongMetadataS3(Body([content])),
            make_settings(),
            object_key=relation.object_key,
            expected_sha256=relation.sha256,
            expected_byte_size=relation.byte_size,
        )
