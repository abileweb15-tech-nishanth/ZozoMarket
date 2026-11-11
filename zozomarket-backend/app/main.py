import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app import __version__
from app.api.v1.api import api_router
from app.core import database
from app.core.config import settings
from app.core.exceptions import error_response, register_exception_handlers
from app.core.logging import configure_logging
from app.core.tenancy import install_tenant_filter
from app.workers.scheduler import Scheduler
from app.workers.sqs_worker import SqsWorker

install_tenant_filter()

configure_logging()
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if settings.AUTO_CREATE_TABLES:
        await database.create_all()
    settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

    scheduler = Scheduler()
    if settings.SCHEDULER_ENABLED and settings.TASK_BACKEND == "inline":
        scheduler.start()

    sqs_worker = SqsWorker()
    if settings.SQS_WORKER_ENABLED:
        sqs_worker.start()

    logger.info("Management API requires a JWT access token")
    logger.info("%s v%s started (%s)", settings.APP_NAME, __version__, settings.ENVIRONMENT)
    try:
        yield
    finally:
        await sqs_worker.stop()
        await scheduler.stop()
        await database.engine.dispose()


def create_app() -> FastAPI:
    is_prod = settings.ENVIRONMENT == "production"
    app = FastAPI(
        title=settings.APP_NAME,
        version=__version__,
        description="Email marketing platform API.",
        lifespan=lifespan,
        docs_url=None if is_prod else "/docs",
        redoc_url=None if is_prod else "/redoc",
        openapi_url=None if is_prod else f"{settings.API_V1_PREFIX}/openapi.json",
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled error [%s] %s %s", request_id, request.method, request.url.path
            )
            response = error_response(500, "Internal server error", "internal_error")
        elapsed_ms = (time.perf_counter() - start) * 1000
        is_docs_path = request.url.path in ("/docs", "/redoc", "/docs/oauth2-redirect")
        is_public_landing_page = request.url.path.startswith(
            f"{settings.API_V1_PREFIX}/public/pages/"
        )

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if not is_public_landing_page:
            response.headers.setdefault("X-Frame-Options", "DENY")
        if settings.ENVIRONMENT == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        if not is_docs_path:
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        if not request.url.path.startswith(f"{settings.API_V1_PREFIX}/t/"):
            logger.info(
                "%s %s -> %s (%.1fms) [%s]",
                request.method,
                request.url.path,
                response.status_code,
                elapsed_ms,
                request_id,
            )
        return response

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-API-Key"],
        expose_headers=["X-Request-ID", "Content-Disposition"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    app.mount(settings.MEDIA_URL_PATH, StaticFiles(directory=settings.MEDIA_ROOT), name="media")

    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        return {"status": "ok", "version": __version__}

    @app.get("/health/ready", tags=["Health"])
    async def ready():
        try:
            async with database.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            logger.exception("Readiness check failed")
            return error_response(503, "Database unavailable", "not_ready")
        return {"status": "ready"}

    return app


app = create_app()
