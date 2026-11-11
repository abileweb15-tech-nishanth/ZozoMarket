import logging
import sys

from app.core.config import settings


def configure_logging() -> None:
    logging.basicConfig(
        level=settings.LOG_LEVEL.upper(),
        format="%(asctime)s %(levelname)-8s %(name)s :: %(message)s",
        stream=sys.stdout,
        force=True,
    )
    for noisy in ("aiosqlite", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if settings.ENVIRONMENT == "production":
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
