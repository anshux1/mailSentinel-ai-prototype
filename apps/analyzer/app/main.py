from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.analyses import AnalysisAPIError, AnalysisErrorResponse, router as analyses_router
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

    async def analysis_error_handler(request: Request, exc: Exception) -> JSONResponse:
        error = cast(AnalysisAPIError, exc)
        request_id = error.request_id or getattr(request.state, "request_id", None)
        if not isinstance(request_id, str) or not request_id:
            request_id = "req_unknown"
        body: dict[str, str] = cast(
            dict[str, str],
            AnalysisErrorResponse(
                code=error.code,
                message=error.message,
                request_id=request_id,
                case_id=error.case_id,
            ).model_dump(by_alias=True, exclude_none=True),
        )
        return JSONResponse(
            status_code=error.status_code,
            content=body,
            headers={"X-Request-ID": request_id},
        )

    async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
        # Pydantic's detailed validation locations can echo untrusted input. Keep
        # the public contract stable and deliberately omit those details.
        request_id = request.headers.get("X-Request-ID")
        if not isinstance(request_id, str) or not request_id or len(request_id) > 128:
            request_id = "req_unknown"
        body = AnalysisErrorResponse(
            code="INVALID_REQUEST_RELATION",
            message="The analysis request payload is invalid.",
            request_id=request_id,
        ).model_dump(by_alias=True, exclude_none=True)
        return JSONResponse(status_code=422, content=body, headers={"X-Request-ID": request_id})

    app.add_exception_handler(AnalysisAPIError, analysis_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(health_router)
    app.include_router(analyses_router)
    app.state.settings = service
    return app


# Defer secret validation to the server lifespan so imports remain safe for tooling and tests.
app = create_app(validate_startup=False)
