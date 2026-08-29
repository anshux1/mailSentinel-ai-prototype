from __future__ import annotations

from app import worker


def test_worker_is_documented_placeholder() -> None:
    assert "setup" in (worker.main.__doc__ or "")
