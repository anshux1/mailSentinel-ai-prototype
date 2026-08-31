from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Protocol

import boto3  # type: ignore[import-untyped]
from botocore.config import Config  # type: ignore[import-untyped]

from app.core.config import Settings


class ArtifactIntegrityMismatchError(RuntimeError):
    """The object does not match the immutable artifact metadata."""


# Short compatibility name for callers/tests.
ArtifactIntegrityMismatch = ArtifactIntegrityMismatchError


class ObjectBody(Protocol):
    def iter_chunks(self, chunk_size: int = 1024 * 1024) -> Any: ...

    def close(self) -> None: ...


@dataclass(frozen=True, slots=True)
class VerifiedObject:
    byte_size: int
    sha256: str


def create_s3_client(settings: Settings) -> Any:
    """Create a client without performing network I/O."""
    addressing_style = "path" if settings.s3_force_path_style else "auto"
    return boto3.client(
        "s3",
        endpoint_url=str(settings.s3_endpoint),
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        config=Config(
            s3={"addressing_style": addressing_style},
            connect_timeout=settings.s3_request_timeout_seconds,
            read_timeout=settings.s3_request_timeout_seconds,
        ),
    )


def verify_s3_object(
    client: Any,
    settings: Settings,
    *,
    object_key: str,
    expected_sha256: str,
    expected_byte_size: int,
) -> VerifiedObject:
    """Stream an object once and verify both transport metadata and its digest."""
    if expected_byte_size <= 0:
        raise ArtifactIntegrityMismatchError

    try:
        result = client.get_object(Bucket=settings.s3_bucket, Key=object_key)
        body = result["Body"]
        try:
            declared_size = result.get("ContentLength")
            if declared_size is not None and int(declared_size) != expected_byte_size:
                raise ArtifactIntegrityMismatchError
            stored_sha256 = result.get("Metadata", {}).get("sha256")
            if stored_sha256 is not None and not hmac.compare_digest(
                str(stored_sha256), expected_sha256
            ):
                raise ArtifactIntegrityMismatchError

            digest = hashlib.sha256()
            byte_size = 0
            for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                if not isinstance(chunk, (bytes, bytearray, memoryview)):
                    raise ArtifactIntegrityMismatchError
                byte_chunk = bytes(chunk)
                byte_size += len(byte_chunk)
                if byte_size > settings.max_eml_bytes or byte_size > expected_byte_size:
                    raise ArtifactIntegrityMismatchError
                digest.update(byte_chunk)
        finally:
            body.close()
    except ArtifactIntegrityMismatchError:
        raise
    except Exception as exc:
        # Callers classify this as a temporary storage failure and let Dramatiq
        # apply its bounded retry policy.  The exception body is not surfaced.
        raise OSError("object storage read failed") from exc

    actual_sha256 = digest.hexdigest()
    if byte_size != expected_byte_size or not hmac.compare_digest(actual_sha256, expected_sha256):
        raise ArtifactIntegrityMismatchError
    return VerifiedObject(byte_size=byte_size, sha256=actual_sha256)
