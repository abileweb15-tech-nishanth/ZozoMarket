"""In-process periodic scheduler used when TASK_BACKEND=inline (Celery beat replaces it)."""

import asyncio
import contextlib
import logging

from app.core.config import settings
from app.workers.jobs import scheduler_tick, wait_for_running_jobs

logger = logging.getLogger(__name__)


async def _loop(interval: float) -> None:
    while True:
        try:
            await scheduler_tick()
        except Exception:
            logger.exception("Scheduler tick failed")
        await asyncio.sleep(interval)


class Scheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(_loop(settings.SCHEDULER_INTERVAL_SECONDS))
            logger.info("Scheduler started (every %ss)", settings.SCHEDULER_INTERVAL_SECONDS)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        await wait_for_running_jobs()
