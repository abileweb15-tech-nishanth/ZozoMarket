"""Sync email open and click events from Amazon SES / CloudWatch metrics.

When recipients open emails in Gmail, Google's proxy fetches the SES tracking pixel
from https://r.us-east-1.awstrack.me/... which SES logs directly to CloudWatch
under namespace 'AWS/SES' with dimension campaign=zozomarket.

This service queries CloudWatch to discover real email opens and update local
database records so condition nodes in automations can branch accordingly.
"""

import asyncio
import datetime as dt
import logging
from typing import Any

import boto3
from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.base import utcnow
from app.models.message import EmailMessage
from app.services import analytics_service

logger = logging.getLogger(__name__)


def _secret(value: object) -> str:
    if value is None:
        return ""
    revealed = value.get_secret_value() if hasattr(value, "get_secret_value") else str(value)
    return revealed or ""


def _fetch_ses_metric_datapoints_sync(
    metric_name: str,
    start_time: dt.datetime,
    end_time: dt.datetime,
) -> list[dict[str, Any]]:
    access_key = (settings.AWS_ACCESS_KEY_ID or "").strip()
    secret_key = _secret(settings.AWS_SECRET_ACCESS_KEY)
    dimension = (settings.SES_CLOUDWATCH_DIMENSION_NAME or "").strip()
    dimension_value = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
    if not access_key or not secret_key or not dimension or not dimension_value:
        return []

    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=dt.UTC)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=dt.UTC)

    try:
        client = boto3.client(
            "cloudwatch",
            region_name=settings.AWS_REGION,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        response = client.get_metric_statistics(
            Namespace="AWS/SES",
            MetricName=metric_name,
            Dimensions=[{"Name": dimension, "Value": dimension_value}],
            StartTime=start_time,
            EndTime=end_time,
            Period=60,
            Statistics=["Sum"],
        )
        return response.get("Datapoints", [])
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        logger.warning("SES CloudWatch %s metric check failed: %s", metric_name, code)
        return []
    except Exception as exc:
        logger.warning("SES CloudWatch %s metric check error: %s", metric_name, exc)
        return []


async def check_ses_message_open(session: AsyncSession, message_or_id: EmailMessage | str) -> bool:
    """Check AWS CloudWatch to see if SES recorded an Open event for this message.

    If an open is found and first_opened_at was not yet recorded, updates the message
    and daily stats. Returns True if the message is opened.
    """
    if isinstance(message_or_id, str):
        message = await session.get(EmailMessage, message_or_id)
    else:
        message = message_or_id

    if message is None:
        return False

    if message.first_opened_at is not None:
        return True

    if not message.sent_at:
        return False

    now = utcnow()
    start_time = message.sent_at - dt.timedelta(minutes=5)
    end_time = now + dt.timedelta(minutes=2)

    datapoints = await asyncio.to_thread(
        _fetch_ses_metric_datapoints_sync, "Open", start_time, end_time
    )
    total_opens = sum(float(p.get("Sum") or 0) for p in datapoints)

    if total_opens > 0:
        sorted_points = sorted(datapoints, key=lambda x: x["Timestamp"])
        first_open_ts = sorted_points[0]["Timestamp"]
        if first_open_ts.tzinfo is None:
            first_open_ts = first_open_ts.replace(tzinfo=dt.UTC)

        message.first_opened_at = first_open_ts
        message.open_count = max(message.open_count, int(total_opens))
        await analytics_service.bump_stats(
            session,
            message.campaign_id,
            workspace_id=message.workspace_id,
            opens=1,
        )
        await session.flush()
        logger.info(
            "Detected AWS SES open for message %s (count: %s, first: %s)",
            message.id,
            total_opens,
            first_open_ts,
        )
        return True

    return False


async def check_ses_message_click(session: AsyncSession, message_or_id: EmailMessage | str) -> bool:
    """Check AWS CloudWatch to see if SES recorded a Click event for this message."""
    if isinstance(message_or_id, str):
        message = await session.get(EmailMessage, message_or_id)
    else:
        message = message_or_id

    if message is None:
        return False

    if message.first_clicked_at is not None:
        return True

    if not message.sent_at:
        return False

    now = utcnow()
    start_time = message.sent_at - dt.timedelta(minutes=5)
    end_time = now + dt.timedelta(minutes=2)

    datapoints = await asyncio.to_thread(
        _fetch_ses_metric_datapoints_sync, "Click", start_time, end_time
    )
    total_clicks = sum(float(p.get("Sum") or 0) for p in datapoints)

    if total_clicks > 0:
        sorted_points = sorted(datapoints, key=lambda x: x["Timestamp"])
        first_click_ts = sorted_points[0]["Timestamp"]
        if first_click_ts.tzinfo is None:
            first_click_ts = first_click_ts.replace(tzinfo=dt.UTC)

        message.first_clicked_at = first_click_ts
        message.click_count = max(message.click_count, int(total_clicks))
        if message.first_opened_at is None:
            message.first_opened_at = first_click_ts
            message.open_count = max(message.open_count, 1)

        await analytics_service.bump_stats(
            session,
            message.campaign_id,
            workspace_id=message.workspace_id,
            clicks=1,
        )
        await session.flush()
        logger.info(
            "Detected AWS SES click for message %s (count: %s, first: %s)",
            message.id,
            total_clicks,
            first_click_ts,
        )
        return True

    return False


async def sync_automation_ses(session: AsyncSession, automation_id: str) -> dict[str, Any]:
    """Scan recent messages for an automation and sync open/click status from AWS SES.

    DEPRECATED for condition evaluation: this function uses aggregate CloudWatch
    metrics, which are workspace-wide and would incorrectly mark all recipients as
    opened. Use sqs_event_service.poll_and_process_sqs() for per-recipient tracking.
    Kept for the manual 'Sync AWS SES' button as a best-effort fallback.
    """
    messages = (
        await session.scalars(
            select(EmailMessage)
            .where(EmailMessage.automation_id == automation_id)
            .order_by(EmailMessage.created_at.desc())
            .limit(20)
        )
    ).all()

    opened_count = 0
    clicked_count = 0
    results = []

    for msg in messages:
        was_opened = msg.first_opened_at is not None
        was_clicked = msg.first_clicked_at is not None

        is_open = await check_ses_message_open(session, msg)
        is_clicked = await check_ses_message_click(session, msg)

        if is_open:
            opened_count += 1
        if is_clicked:
            clicked_count += 1

        results.append(
            {
                "message_id": msg.id,
                "to_email": msg.to_email,
                "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
                "first_opened_at": msg.first_opened_at.isoformat() if msg.first_opened_at else None,
                "open_count": msg.open_count,
                "is_opened": is_open,
                "newly_detected": (is_open and not was_opened) or (is_clicked and not was_clicked),
            }
        )

    await session.commit()
    return {
        "checked": len(messages),
        "opened_count": opened_count,
        "clicked_count": clicked_count,
        "results": results,
    }


async def summarise_automation_messages(session: AsyncSession, automation_id: str) -> dict[str, Any]:
    """Return a per-recipient open/click summary for an automation without calling
    CloudWatch. Reads directly from the email_messages table which has already been
    updated by the SQS worker with accurate per-recipient open/click timestamps.
    """
    messages = (
        await session.scalars(
            select(EmailMessage)
            .where(EmailMessage.automation_id == automation_id)
            .order_by(EmailMessage.created_at.desc())
            .limit(50)
        )
    ).all()

    opened_count = sum(1 for m in messages if m.first_opened_at is not None and not getattr(m, "is_bot_suspected", False))
    clicked_count = sum(1 for m in messages if m.first_clicked_at is not None)
    results = [
        {
            "message_id": msg.id,
            "to_email": msg.to_email,
            "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
            "first_opened_at": msg.first_opened_at.isoformat() if msg.first_opened_at else None,
            "open_count": msg.open_count,
            "is_opened": msg.first_opened_at is not None and not getattr(msg, "is_bot_suspected", False),
            "newly_detected": False,
        }
        for msg in messages
    ]
    return {
        "checked": len(messages),
        "opened_count": opened_count,
        "clicked_count": clicked_count,
        "results": results,
    }

