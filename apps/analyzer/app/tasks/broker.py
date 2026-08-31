from __future__ import annotations

from threading import Lock
from typing import Any

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from dramatiq.middleware import Retries

from app.core.config import Settings


class QueueUnavailableError(RuntimeError):
    """Raised when a job cannot be accepted by Redis/Dramatiq."""


QueueUnavailable = QueueUnavailableError


_broker: Any | None = None
_broker_url: str | None = None
_broker_lock = Lock()


def create_broker(settings: Settings) -> RedisBroker:
    """Build a Redis broker without connecting to Redis."""
    retries = Retries(
        max_retries=settings.dramatiq_max_retries,
        min_backoff=settings.dramatiq_min_backoff_ms,
        max_backoff=settings.dramatiq_max_backoff_ms,
    )
    return RedisBroker(  # type: ignore[no-untyped-call]
        url=settings.redis_url,
        namespace="mailsentinel",
        middleware=[retries],
    )


def configure_broker(settings: Settings) -> RedisBroker:
    """Configure the process broker lazily, allowing imports and unit tests offline."""
    global _broker, _broker_url
    with _broker_lock:
        if isinstance(_broker, RedisBroker) and _broker_url == settings.redis_url:
            return _broker
        broker = create_broker(settings)
        dramatiq.set_broker(broker)
        _broker = broker
        _broker_url = settings.redis_url
        return broker


def broker_for(settings: Settings) -> RedisBroker:
    return configure_broker(settings)


def reset_broker_for_tests() -> None:
    global _broker, _broker_url
    with _broker_lock:
        _broker = None
        _broker_url = None


def send_message(send: Any) -> None:
    """Translate broker errors to a stable, non-sensitive service exception."""
    try:
        send()
    except Exception as exc:
        raise QueueUnavailableError from exc
