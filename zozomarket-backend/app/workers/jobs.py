"""Background jobs. Each job owns its DB session so it can run in-process (FastAPI
BackgroundTasks / scheduler loop) or inside a Celery worker unchanged."""

import asyncio
import logging

from fastapi import BackgroundTasks

from app.core import database
from app.core.config import settings
from app.services import automation_service, campaign_service

logger = logging.getLogger(__name__)
_running: set[asyncio.Task] = set()
_sqlite_lock = asyncio.Lock()


async def dispatch_campaign(campaign_id: str) -> None:
    if "sqlite" in settings.DATABASE_URL:
        async with _sqlite_lock:
            async with database.SessionLocal() as session:
                await campaign_service.run_dispatch(session, campaign_id)
    else:
        async with database.SessionLocal() as session:
            await campaign_service.run_dispatch(session, campaign_id)


async def scheduler_tick() -> dict[str, int]:
    """Claim due campaigns. Safe to run on many instances."""
    async with database.SessionLocal() as session:
        claimed = await campaign_service.claim_due(session)
    for campaign_id in claimed:
        if settings.TASK_BACKEND == "celery":
            _send_celery(campaign_id)
        else:
            task = asyncio.create_task(dispatch_campaign(campaign_id))
            _running.add(task)
            task.add_done_callback(_running.discard)
    async with database.SessionLocal() as session:
        resumed = await automation_service.process_due_enrollments(session)
    if claimed or resumed:
        logger.info("Scheduler tick: %d campaign(s), %d automation step(s)", len(claimed), resumed)
    return {"campaigns": len(claimed), "automations": resumed}


def _send_celery(campaign_id: str) -> None:
    from app.workers.celery_app import celery_app

    celery_app.send_task("zozomarket.dispatch_campaign", args=[campaign_id])


def enqueue_campaign_dispatch(campaign_id: str, background_tasks: BackgroundTasks) -> None:
    if settings.TASK_BACKEND == "celery":
        _send_celery(campaign_id)
    else:
        background_tasks.add_task(dispatch_campaign, campaign_id)


async def wait_for_running_jobs(grace_seconds: float = 30) -> None:
    if _running:
        await asyncio.wait(_running, timeout=grace_seconds)
