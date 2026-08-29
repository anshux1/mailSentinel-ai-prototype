from __future__ import annotations

import socket
import urllib.error
import urllib.request
from typing import cast
from urllib.parse import ParseResult, urlparse

from fastapi import APIRouter, Request, Response, status

from app.core.config import Settings

router = APIRouter(tags=["health"])
CHECK_TIMEOUT_SECONDS = 1.0


def _endpoint(raw_url: str, schemes: set[str], default_port: int) -> tuple[str, int] | None:
    try:
        parsed = urlparse(raw_url)
        parsed_port = parsed.port
    except ValueError:
        return None

    if parsed.scheme not in schemes or not parsed.hostname:
        return None

    port = parsed_port if parsed_port is not None else default_port
    if not 1 <= port <= 65535:
        return None
    return parsed.hostname, port


def _tcp_check(host: str, port: int, timeout: float = CHECK_TIMEOUT_SECONDS) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _check_postgres(raw_url: str) -> bool:
    endpoint = _endpoint(raw_url, {"postgres", "postgresql"}, 5432)
    return endpoint is not None and _tcp_check(*endpoint)


def _resp_command(parts: tuple[str, ...]) -> bytes:
    encoded = [part.encode("utf-8") for part in parts]
    body = b"".join(
        b"$" + str(len(part)).encode("ascii") + b"\r\n" + part + b"\r\n" for part in encoded
    )
    return b"*" + str(len(encoded)).encode("ascii") + b"\r\n" + body


def _redis_response_is_ok(connection: socket.socket) -> bool:
    try:
        return connection.recv(128).startswith(b"+")
    except OSError:
        return False


def _check_redis(raw_url: str) -> bool:
    endpoint = _endpoint(raw_url, {"redis"}, 6379)
    if endpoint is None:
        return False

    try:
        parsed = urlparse(raw_url)
        with socket.create_connection(endpoint, timeout=CHECK_TIMEOUT_SECONDS) as connection:
            connection.settimeout(CHECK_TIMEOUT_SECONDS)
            if parsed.password:
                auth_parts = (
                    ("AUTH", parsed.username, parsed.password)
                    if parsed.username
                    else ("AUTH", parsed.password)
                )
                connection.sendall(_resp_command(auth_parts))
                if not _redis_response_is_ok(connection):
                    return False
            connection.sendall(_resp_command(("PING",)))
            return _redis_response_is_ok(connection)
    except (OSError, ValueError):
        return False


def _http_endpoint(endpoint: ParseResult) -> str:
    return f"{endpoint.scheme}://{endpoint.netloc}/minio/health/ready"


def _check_s3(raw_url: str) -> bool:
    try:
        parsed = urlparse(raw_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        request = urllib.request.Request(_http_endpoint(parsed), method="GET")
        with urllib.request.urlopen(request, timeout=CHECK_TIMEOUT_SECONDS) as response:
            return bool(response.status == 200)
    except (OSError, urllib.error.URLError, ValueError):
        return False


def _request_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


@router.get("/health/live")
def live(request: Request) -> dict[str, object]:
    service = _request_settings(request)
    return {
        "service": service.service_name,
        "status": "ok",
        "version": service.service_version,
    }


@router.get("/health/ready")
def ready(request: Request, response: Response) -> dict[str, object]:
    service = _request_settings(request)
    checks = {
        "database": _check_postgres(service.database_url),
        "redis": _check_redis(service.redis_url),
        "s3": _check_s3(str(service.s3_endpoint)),
    }
    dependencies_ready = all(checks.values())
    ready_status = dependencies_ready or not service.readiness_checks_enabled

    if service.readiness_checks_enabled and not dependencies_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "service": service.service_name,
        "status": "ready" if ready_status else "degraded",
        "version": service.service_version,
        "dependencies": checks,
    }
