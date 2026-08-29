from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import health
from app.core.config import Settings
from app.main import create_app

AUTHTOKEN = "22345678901234567890123456789012"


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "test",
        "analyzer_service_token": AUTHTOKEN,
        "database_url": "postgresql://mailsentinel:pass@postgres:5432/mailsentinel",
        "redis_url": "redis://:pass@redis:6379/0",
        "s3_endpoint": "http://minio:9000",
        "s3_access_key_id": "local-access",
        "s3_secret_access_key": "local-secret-value",
        "readiness_checks_enabled": True,
    }
    values.update(overrides)
    return Settings(**values)


def test_app_imports() -> None:
    app = create_app(_settings())
    assert app.title == "mailsentinel-analyzer"


def test_liveness_returns_200() -> None:
    client = TestClient(create_app(_settings()))
    response = client.get("/health/live")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "mailsentinel-analyzer"
    assert payload["status"] == "ok"
    assert payload["version"] == "0.1.0"


def test_readiness_fails_when_any_dependency_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(health, "_check_postgres", lambda _: True)
    monkeypatch.setattr(health, "_check_redis", lambda _: False)
    monkeypatch.setattr(health, "_check_s3", lambda _: True)

    response = TestClient(create_app(_settings())).get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["dependencies"] == {"database": True, "redis": False, "s3": True}


def test_readiness_succeeds_when_dependencies_are_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(health, "_check_postgres", lambda _: True)
    monkeypatch.setattr(health, "_check_redis", lambda _: True)
    monkeypatch.setattr(health, "_check_s3", lambda _: True)

    response = TestClient(create_app(_settings())).get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_readiness_can_be_disabled() -> None:
    response = TestClient(create_app(_settings(readiness_checks_enabled=False))).get(
        "/health/ready"
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_readiness_is_safe_and_redacted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(health, "_check_postgres", lambda _: False)
    monkeypatch.setattr(health, "_check_redis", lambda _: False)
    monkeypatch.setattr(health, "_check_s3", lambda _: False)

    body = TestClient(create_app(_settings())).get("/health/ready").text

    assert AUTHTOKEN not in body
    assert "replace-me" not in body
    assert "postgres" not in body


def test_settings_rejects_short_service_tokens() -> None:
    with pytest.raises(ValueError, match="ANALYZER_SERVICE_TOKEN"):
        create_app(_settings(app_env="production", analyzer_service_token="short"))


def test_server_lifespan_validates_startup_secrets() -> None:
    app = create_app(
        _settings(
            app_env="production",
            analyzer_service_token="short",
        ),
        validate_startup=False,
    )

    with pytest.raises(ValueError, match="ANALYZER_SERVICE_TOKEN"):
        with TestClient(app):
            pass


def test_settings_rejects_malformed_database_urls() -> None:
    with pytest.raises(ValueError, match="DATABASE_URL"):
        Settings(database_url="http://postgres:5432/mailsentinel")
