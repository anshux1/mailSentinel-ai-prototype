from __future__ import annotations

import logging

from dramatiq.worker import Worker

from app.core.config import get_settings, validate_required_startup_secrets
from app.tasks.actors import process_analysis  # noqa: F401 - registers the actor
from app.tasks.broker import configure_broker

logger = logging.getLogger("mailsentinel.worker")


def main() -> None:
    """Run the bounded Phase 3 verification worker; setup is no longer a placeholder."""
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    validate_required_startup_secrets(settings)
    broker = configure_broker(settings)
    worker = Worker(broker, queues={settings.dramatiq_queue_name})
    logger.info("analysis worker starting", extra={"stage": "worker_start"})
    worker.start()
    try:
        worker.join()
    except KeyboardInterrupt:
        logger.info("analysis worker stopping", extra={"stage": "worker_stop"})
        worker.stop()


if __name__ == "__main__":
    main()
