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
from app.workers.scheduler import Scheduler

configure_logging()
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if settings.AUTO_CREATE_TABLES:
        await database.create_all()
    if settings.SEED_DEMO_DATA:
        from app.services.seed import seed_demo_data

        async with database.SessionLocal() as session:
            await seed_demo_data(session)
    settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

    scheduler = Scheduler()
    if settings.SCHEDULER_ENABLED and settings.TASK_BACKEND == "inline":
        scheduler.start()
    if not settings.auth_enabled:
        logger.warning("API_KEYS is empty: management API is UNAUTHENTICATED (dev only)")
    logger.info("%s v%s started (%s)", settings.APP_NAME, __version__, settings.ENVIRONMENT)
    try:
        yield
    finally:
        await scheduler.stop()
        await database.engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=__version__,
        description="AI-powered email marketing platform API.",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
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
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
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
        allow_headers=["*"],
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
