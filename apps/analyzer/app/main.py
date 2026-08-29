from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import Settings, get_settings, validate_required_startup_secrets


@asynccontextmanager
async def startup_lifespan(application: FastAPI) -> AsyncIterator[None]:
    validate_required_startup_secrets(application.state.settings)
    yield


def create_app(settings: Settings | None = None, *, validate_startup: bool = True) -> FastAPI:
    service = settings or get_settings()
    if validate_startup:
        validate_required_startup_secrets(service)

    app = FastAPI(
        title=service.service_name,
        version=service.service_version,
        lifespan=startup_lifespan,
    )
    app.include_router(health_router)
    app.state.settings = service
    return app


# Defer secret validation to the server lifespan so imports remain safe for tooling and tests.
app = create_app(validate_startup=False)
