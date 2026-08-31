from __future__ import annotations

from app import worker


def test_worker_is_documented_as_phase3_verification_worker() -> None:
    assert "Phase 3 verification worker" in (worker.main.__doc__ or "")
