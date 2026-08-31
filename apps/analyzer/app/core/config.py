from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import AnyUrl, Field, PositiveInt, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
        populate_by_name=True,
    )

    service_name: str = Field(default="mailsentinel-analyzer", alias="ANALYZER_SERVICE_NAME")
    service_version: str = Field(default="0.1.0", alias="ANALYZER_SERVICE_VERSION")
    app_env: Literal["development", "test", "production"] = Field(
        default="development", alias="APP_ENV"
    )
    analysis_version: str = Field(default="prototype-1", alias="ANALYSIS_VERSION")
    provider_mode: Literal["fixture", "offline", "live"] = Field(
        default="offline", alias="ENRICHMENT_MODE"
    )
    database_url: str = Field(
        default="postgresql://mailsentinel:replace-me@postgres:5432/mailsentinel",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://:replace-me@redis:6379/0", alias="REDIS_URL")
    dramatiq_queue_name: str = Field(
        default="mailsentinel.analysis", alias="DRAMATIQ_QUEUE_NAME", min_length=1, max_length=128
    )
    dramatiq_max_retries: int = Field(default=3, alias="DRAMATIQ_MAX_RETRIES", ge=0, le=10)
    dramatiq_min_backoff_ms: PositiveInt = Field(
        default=1000, alias="DRAMATIQ_MIN_BACKOFF_MS", le=300_000
    )
    dramatiq_max_backoff_ms: PositiveInt = Field(
        default=30_000, alias="DRAMATIQ_MAX_BACKOFF_MS", le=3_600_000
    )
    s3_endpoint: AnyUrl = Field(default=AnyUrl("http://minio:9000"), alias="S3_ENDPOINT")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")
    s3_bucket: str = Field(default="mailsentinel-evidence", alias="S3_BUCKET")
    s3_access_key_id: str = Field(default="replace-me", alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: SecretStr = Field(
        default=SecretStr("replace-me"), alias="S3_SECRET_ACCESS_KEY"
    )
    s3_force_path_style: bool = Field(default=True, alias="S3_FORCE_PATH_STYLE")
    s3_request_timeout_seconds: PositiveInt = Field(
        default=10, alias="S3_REQUEST_TIMEOUT_SECONDS", le=300
    )
    analyzer_service_token: SecretStr | None = Field(default=None, alias="ANALYZER_SERVICE_TOKEN")
    max_eml_bytes: PositiveInt = Field(default=26214400, alias="MAX_EML_BYTES")
    max_mime_parts: PositiveInt = Field(default=200, alias="MAX_MIME_PARTS")
    max_header_count: PositiveInt = Field(default=1000, alias="MAX_HEADER_COUNT")
    max_urls: PositiveInt = Field(default=500, alias="MAX_URLS")
    max_attachment_bytes: PositiveInt = Field(default=10485760, alias="MAX_ATTACHMENT_BYTES")
    maxmind_db_path: str | None = Field(default=None, alias="MAXMIND_DB_PATH")
    abuseipdb_api_key: str | None = Field(default=None, alias="ABUSEIPDB_API_KEY")
    retention_days: PositiveInt = Field(default=90, alias="RETENTION_DAYS")
    readiness_checks_enabled: bool = Field(default=True, alias="READINESS_CHECKS_ENABLED")
    port: PositiveInt = Field(default=8000, alias="ANALYZER_PORT")

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
            raise ValueError("DATABASE_URL must be a PostgreSQL URL")
        return value

    @field_validator("redis_url")
    @classmethod
    def validate_redis_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "redis" or not parsed.hostname:
            raise ValueError("REDIS_URL must be a Redis URL")
        return value

    @field_validator("dramatiq_queue_name")
    @classmethod
    def validate_queue_name(cls, value: str) -> str:
        if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
            raise ValueError("DRAMATIQ_QUEUE_NAME cannot contain control characters")
        return value

    @field_validator("s3_endpoint")
    @classmethod
    def validate_s3_endpoint(cls, value: AnyUrl) -> AnyUrl:
        if str(value.scheme) not in {"http", "https"}:
            raise ValueError("S3_ENDPOINT must use http or https")
        return value


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized.startswith("replace-") or normalized.startswith("your-")


def validate_required_startup_secrets(settings: Settings) -> None:
    if settings.app_env == "test":
        return

    missing: list[str] = []
    token = (
        settings.analyzer_service_token.get_secret_value()
        if settings.analyzer_service_token
        else ""
    )
    if not token or _is_placeholder(token):
        missing.append("ANALYZER_SERVICE_TOKEN")
    elif len(token) < 32:
        raise ValueError("ANALYZER_SERVICE_TOKEN must be at least 32 characters long")

    if not settings.s3_access_key_id or _is_placeholder(settings.s3_access_key_id):
        missing.append("S3_ACCESS_KEY_ID")

    s3_secret = settings.s3_secret_access_key.get_secret_value()
    if not s3_secret or _is_placeholder(s3_secret):
        missing.append("S3_SECRET_ACCESS_KEY")

    if missing:
        missing_names = ", ".join(sorted(missing))
        raise ValueError("Missing or placeholder required environment values: " + missing_names)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
