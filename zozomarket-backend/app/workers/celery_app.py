"""Celery worker + beat (TASK_BACKEND=celery). Requires the `worker` extra.

celery -A app.workers.celery_app worker -l info
celery -A app.workers.celery_app beat -l info
"""

import asyncio
from collections.abc import Awaitable
from typing import TypeVar

from celery import Celery

from app.core import database
from app.core.config import settings
from app.core.logging import configure_logging
from app.workers import jobs

T = TypeVar("T")

configure_logging()

celery_app = Celery(
    "zozomarket", broker=settings.CELERY_BROKER_URL, backend=settings.CELERY_RESULT_BACKEND
)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    beat_schedule={
        "scheduler-tick": {
            "task": "zozomarket.scheduler_tick",
            "schedule": float(settings.SCHEDULER_INTERVAL_SECONDS),
        }
    },
)


def _run(coro: Awaitable[T]) -> T:
    async def _wrapped() -> T:
        try:
            return await coro
        finally:
            # Each task gets a fresh event loop; pooled connections must not outlive it.
            await database.engine.dispose()

    return asyncio.run(_wrapped())


@celery_app.task(name="zozomarket.dispatch_campaign")
def dispatch_campaign(campaign_id: str) -> None:
    _run(jobs.dispatch_campaign(campaign_id))


@celery_app.task(name="zozomarket.scheduler_tick")
def scheduler_tick() -> dict[str, int]:
    return _run(jobs.scheduler_tick())
