from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.analyses import AnalysisIntakeRequest
from app.core.config import Settings
from app.main import create_app
from app.services.repository import AnalysisRelation

TOKEN = "22345678901234567890123456789012"


class FakeRepository:
    def __init__(self, relation: AnalysisRelation) -> None:
        self.relation = relation
        self.enqueues = 0
        self.deferred: list[str] = []

    def validate_relation(self, payload: AnalysisIntakeRequest) -> AnalysisRelation:
        return self.relation

    def enqueue_once(
        self,
        relation: AnalysisRelation,
        enqueue: Callable[[], None],
        *,
        request_id: str,
    ) -> bool:
        if self.enqueues:
            return False
        enqueue()
        self.enqueues += 1
        return True

    def mark_analysis_deferred(
        self,
        relation: AnalysisRelation,
        *,
        failure_code: str,
        safe_message: str,
        request_id: str,
    ) -> bool:
        self.deferred.append(failure_code)
        return True

    def mark_analysis_failed(self, *args: object, **kwargs: object) -> bool:
        return True


def settings() -> Settings:
    return Settings(
        app_env="test",
        analyzer_service_token=TOKEN,
        database_url="postgresql://user:pass@localhost/db",
        redis_url="redis://localhost/0",
        s3_endpoint="http://localhost:9000",
        s3_access_key_id="access",
        s3_secret_access_key="secret",
    )


def request_payload() -> dict[str, object]:
    return {
        "caseId": "case_1",
        "organizationId": "org_1",
        "analysisRunId": "run_1",
        "artifact": {
            "objectKey": "organizations/org_1/cases/case_1/artifacts/art_1.eml",
            "sha256": "a" * 64,
            "byteSize": 10,
        },
        "requestedAt": datetime.now(UTC).isoformat(),
        "requestId": "req_test",
    }


def test_service_token_and_relation_enqueue_once() -> None:
    relation = AnalysisRelation(
        organization_id="org_1",
        case_id="case_1",
        analysis_run_id="run_1",
        object_key="organizations/org_1/cases/case_1/artifacts/art_1.eml",
        sha256="a" * 64,
        byte_size=10,
        status="queued",
    )
    repository = FakeRepository(relation)
    app = create_app(settings())
    app.state.analysis_repository = repository
    sent: list[str] = []
    app.state.enqueue_analysis = lambda payload, current: sent.append(current.analysis_run_id)
    client = TestClient(app)

    first = client.post(
        "/v1/analyses",
        json=request_payload(),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    second = client.post(
        "/v1/analyses",
        json=request_payload(),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.headers["Idempotent-Replay"] == "true"
    assert sent == ["run_1"]


def test_bad_service_token_is_safe_and_constant_time_path_is_used() -> None:
    app = create_app(settings())
    response = TestClient(app).post(
        "/v1/analyses",
        json=request_payload(),
        headers={"Authorization": "Bearer wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {
        "code": "INVALID_SERVICE_CREDENTIALS",
        "message": "Service authentication is required.",
        "requestId": response.json()["requestId"],
    }
    assert TOKEN not in response.text
