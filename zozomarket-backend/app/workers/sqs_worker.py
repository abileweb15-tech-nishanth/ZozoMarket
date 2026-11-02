"""Amazon SQS Event Worker.

Continuously long-polls the SES SQS queue for Open, Click, Delivery, and Bounce events
and updates individual recipient records in real time.
"""

import argparse
import asyncio
import contextlib
import logging

from app.core import database
from app.core.config import settings
from app.services import sqs_event_service

logger = logging.getLogger(__name__)


async def _sqs_loop(interval: float, wait_seconds: int, max_messages: int) -> None:
    logger.info("SQS event worker loop started (queue: %s)", settings.SQS_QUEUE_URL)
    while True:
        try:
            async with database.SessionLocal() as session:
                result = await sqs_event_service.poll_and_process_sqs(
                    session,
                    max_messages=max_messages,
                    wait_seconds=wait_seconds,
                )
                if result.get("processed", 0) > 0:
                    logger.info(
                        "SQS worker processed %d event(s): %s",
                        result["processed"],
                        result.get("events"),
                    )
        except Exception:
            logger.exception("SQS worker poll iteration failed")

        await asyncio.sleep(interval)


class SqsWorker:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None and settings.SQS_WORKER_ENABLED:
            self._task = asyncio.create_task(
                _sqs_loop(
                    interval=settings.SQS_POLL_INTERVAL_SECONDS,
                    wait_seconds=settings.SQS_WAIT_TIME_SECONDS,
                    max_messages=settings.SQS_MAX_MESSAGES,
                )
            )
            logger.info("SQS Worker background task started")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
            logger.info("SQS Worker stopped")


async def run_once() -> dict:
    async with database.SessionLocal() as session:
        result = await sqs_event_service.poll_and_process_sqs(
            session,
            max_messages=settings.SQS_MAX_MESSAGES,
            wait_seconds=2,
        )
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description="SQS SES Event Worker")
    parser.add_argument("--once", action="store_true", help="Poll once and exit")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    if args.once:
        print("Polling SQS once...")
        res = asyncio.run(run_once())
        print(f"Result: {res}")
    else:
        print("Starting SQS worker daemon...")
        asyncio.run(
            _sqs_loop(
                interval=settings.SQS_POLL_INTERVAL_SECONDS,
                wait_seconds=settings.SQS_WAIT_TIME_SECONDS,
                max_messages=settings.SQS_MAX_MESSAGES,
            )
        )


if __name__ == "__main__":
    main()
