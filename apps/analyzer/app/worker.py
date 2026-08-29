from __future__ import annotations

import logging

logger = logging.getLogger("mailsentinel.worker")


def main() -> None:
    """Document the worker entry point without processing jobs during setup."""
    logging.basicConfig(level=logging.INFO)
    logger.info(
        "Worker lifecycle is a setup placeholder; processing is deferred to the product phase."
    )


if __name__ == "__main__":
    main()
