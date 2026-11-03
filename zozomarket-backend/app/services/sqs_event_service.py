"""Amazon SQS Event Processing Service for granular SES events.

Receives granular email lifecycle events (Send, Delivery, Open, Click, Bounce)
published by Amazon SES to SNS topic 'zozomarket-ses-events' and queued in SQS
'zozomarket-ses-events-queue'.

Matches SES 'messageId' against 'EmailMessage.provider_message_id', updating
per-recipient delivery/open/click timestamps and triggering individual subscriber
automation sequences.
"""

import asyncio
import datetime as dt
import json
import logging
from typing import Any

import boto3
from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.base import utcnow
from app.models.message import EmailMessage, MessageStatus
from app.services import analytics_service, automation_service

logger = logging.getLogger(__name__)


def _secret(value: object) -> str:
    if value is None:
        return ""
    revealed = value.get_secret_value() if hasattr(value, "get_secret_value") else str(value)
    return revealed or ""


def _parse_iso_timestamp(stamp: str | None) -> dt.datetime:
    if not stamp:
        return utcnow()
    try:
        parsed = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.UTC)
        return parsed
    except Exception:
        return utcnow()


def _get_sqs_client():
    access_key = (settings.AWS_ACCESS_KEY_ID or "").strip()
    secret_key = _secret(settings.AWS_SECRET_ACCESS_KEY)
    if not access_key or not secret_key:
        return None
    return boto3.client(
        "sqs",
        region_name=settings.AWS_REGION,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def _receive_messages_sync(queue_url: str, max_messages: int, wait_seconds: int) -> list[dict[str, Any]]:
    client = _get_sqs_client()
    if client is None:
        return []
    try:
        response = client.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=min(max_messages, 10),
            WaitTimeSeconds=max(0, min(wait_seconds, 20)),
        )
        return response.get("Messages", [])
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        logger.warning("SQS receive_message failed (%s): %s", code, exc)
        return []
    except Exception as exc:
        logger.warning("SQS receive_message error: %s", exc)
        return []


def _delete_message_sync(queue_url: str, receipt_handle: str) -> bool:
    client = _get_sqs_client()
    if client is None:
        return False
    try:
        client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
        return True
    except Exception as exc:
        logger.warning("Failed to delete SQS message: %s", exc)
        return False


def evaluate_open_event(
    send_timestamp: dt.datetime | str | None,
    open_timestamp: dt.datetime | str | None,
    already_opened: bool,
    had_bot_scan: bool,
    threshold_seconds: float = 5.0,
) -> dict[str, Any]:
    """Classify open event as bot scan, first human open, transition from bot, or subsequent open."""
    send_dt = _parse_iso_timestamp(send_timestamp) if isinstance(send_timestamp, str) else send_timestamp
    open_dt = _parse_iso_timestamp(open_timestamp) if isinstance(open_timestamp, str) else open_timestamp

    if send_dt and send_dt.tzinfo is None:
        send_dt = send_dt.replace(tzinfo=dt.UTC)
    if open_dt and open_dt.tzinfo is None:
        open_dt = open_dt.replace(tzinfo=dt.UTC)

    time_diff_seconds = (open_dt - send_dt).total_seconds() if (send_dt and open_dt) else 999.0

    if already_opened:
        # Subsequent human open: update last open, increment count, no duplicate automation trigger
        return {
            "action": "UPDATE_LAST_OPEN",
            "is_human": True,
            "is_bot": False,
            "trigger_automation": False,
            "time_diff": time_diff_seconds,
        }

    if time_diff_seconds < threshold_seconds:
        # Bot scan: too fast for human reading (< 5.0s)
        return {
            "action": "RECORD_BOT_SCAN",
            "is_bot": True,
            "is_human": False,
            "trigger_automation": False,
            "time_diff": time_diff_seconds,
        }

    if had_bot_scan:
        # Bot suspicion cleared: real human opened after bot pre-fetch!
        return {
            "action": "TRANSITION_BOT_TO_HUMAN",
            "is_human": True,
            "is_bot": False,
            "trigger_automation": True,
            "time_diff": time_diff_seconds,
        }

    # First genuine human open
    return {
        "action": "FIRST_HUMAN_OPEN",
        "is_human": True,
        "is_bot": False,
        "trigger_automation": True,
        "time_diff": time_diff_seconds,
    }


async def process_sqs_event_payload(session: AsyncSession, ses_event: dict[str, Any]) -> dict[str, Any]:
    """Process a single unpacked SES event dictionary."""
    event_type = ses_event.get("eventType") or ses_event.get("notificationType") or ""
    mail = ses_event.get("mail") or {}
    message_id = mail.get("messageId")

    result = {
        "event_type": event_type,
        "message_id": message_id,
        "matched": False,
        "email_message_id": None,
        "recipient": None,
        "action_taken": None,
    }

    if not message_id:
        result["action_taken"] = "ignored_no_message_id"
        return result

    # Find the individual recipient email message by provider_message_id
    message = (
        await session.scalars(
            select(EmailMessage).where(EmailMessage.provider_message_id == message_id)
        )
    ).first()

    if message is None:
        result["action_taken"] = "no_matching_email_message"
        return result

    result["matched"] = True
    result["email_message_id"] = message.id
    result["recipient"] = message.to_email

    if event_type == "Open":
        open_data = ses_event.get("open") or {}
        opened_at = _parse_iso_timestamp(open_data.get("timestamp"))
        send_time = mail.get("timestamp") or message.sent_at

        already_opened = message.opened
        had_bot_scan = bool(message.is_bot_suspected or message.bot_scan_at)

        eval_res = evaluate_open_event(
            send_timestamp=send_time,
            open_timestamp=opened_at,
            already_opened=already_opened,
            had_bot_scan=had_bot_scan,
            threshold_seconds=5.0,
        )

        action = eval_res["action"]
        time_diff = eval_res["time_diff"]

        if action == "RECORD_BOT_SCAN":
            if message.bot_scan_at is None:
                message.bot_scan_at = opened_at
            message.last_bot_scan_at = opened_at
            message.is_bot_suspected = True
            message.status = MessageStatus.BOT_SUSPECTED
            result["action_taken"] = f"bot_scan_recorded (diff={time_diff:.2f}s < 5.0s, no_automation)"
            logger.info(
                "Bot scan detected for message %s (recipient %s, diff %.2fs). Automation held.",
                message.id,
                message.to_email,
                time_diff,
            )

        elif action == "TRANSITION_BOT_TO_HUMAN":
            if message.first_opened_at is None:
                message.first_opened_at = opened_at
            message.last_opened_at = opened_at
            message.open_count = (message.open_count or 0) + 1
            message.is_bot_suspected = False
            message.status = MessageStatus.HUMAN_OPENED

            await analytics_service.bump_stats(
                session, message.campaign_id, workspace_id=message.workspace_id, opens=1
            )
            await automation_service.handle_email_opened(session, message)
            result["action_taken"] = f"bot_to_human_transition (diff={time_diff:.2f}s, trigger_automation=True)"
            logger.info(
                "Bot suspicion cleared for message %s (recipient %s). Human open confirmed; automation triggered.",
                message.id,
                message.to_email,
            )

        elif action == "FIRST_HUMAN_OPEN":
            message.first_opened_at = opened_at
            message.last_opened_at = opened_at
            message.open_count = (message.open_count or 0) + 1
            message.is_bot_suspected = False
            message.status = MessageStatus.HUMAN_OPENED

            await analytics_service.bump_stats(
                session, message.campaign_id, workspace_id=message.workspace_id, opens=1
            )
            await automation_service.handle_email_opened(session, message)
            result["action_taken"] = f"first_human_open (diff={time_diff:.2f}s, trigger_automation=True)"
            logger.info(
                "First human open for message %s (recipient %s, diff %.2fs). Automation triggered.",
                message.id,
                message.to_email,
                time_diff,
            )

        elif action == "UPDATE_LAST_OPEN":
            message.last_opened_at = opened_at
            message.open_count = (message.open_count or 0) + 1
            message.is_bot_suspected = False
            result["action_taken"] = f"subsequent_open (count={message.open_count}, no_duplicate_automation)"
            logger.info(
                "Subsequent open for message %s (recipient %s, count %d). Last open updated.",
                message.id,
                message.to_email,
                message.open_count,
            )

    elif event_type == "Click":
        click_data = ses_event.get("click") or {}
        clicked_at = _parse_iso_timestamp(click_data.get("timestamp"))
        clicked_url = click_data.get("link")

        was_first_click = message.first_clicked_at is None
        if was_first_click:
            message.first_clicked_at = clicked_at

        if message.first_opened_at is None:
            message.first_opened_at = clicked_at
            message.open_count = max(message.open_count or 0, 1)

        message.last_opened_at = clicked_at
        message.click_count = (message.click_count or 0) + 1
        if clicked_url:
            message.last_clicked_url = clicked_url

        # A click definitively proves human interaction -> clear any bot suspicion
        message.is_bot_suspected = False
        message.status = MessageStatus.HUMAN_OPENED

        if was_first_click:
            await analytics_service.bump_stats(
                session, message.campaign_id, workspace_id=message.workspace_id, clicks=1
            )

        # Trigger click-based automation actions
        await automation_service.handle_email_clicked(session, message, clicked_url)
        result["action_taken"] = f"click_recorded (url={clicked_url})"

    elif event_type == "Bounce":
        bounce_data = ses_event.get("bounce") or {}
        bounce_type = (bounce_data.get("bounceType") or "permanent").lower()
        sub_type = bounce_data.get("bounceSubType") or ""
        reason = f"SES Bounce: {bounce_type} ({sub_type})"

        await analytics_service.record_bounce(
            session, message, bounce_type=bounce_type, reason=reason
        )
        result["action_taken"] = f"bounce_recorded ({bounce_type})"

    elif event_type == "Delivery":
        delivery_data = ses_event.get("delivery") or {}
        delivered_at = _parse_iso_timestamp(delivery_data.get("timestamp"))
        message.delivered_at = delivered_at
        if message.status != MessageStatus.BOUNCED:
            message.status = MessageStatus.DELIVERED
        result["action_taken"] = "delivery_recorded"

    else:
        result["action_taken"] = f"unhandled_event_type_{event_type}"

    return result


async def poll_and_process_sqs(
    session: AsyncSession,
    *,
    queue_url: str | None = None,
    max_messages: int = 10,
    wait_seconds: int = 5,
) -> dict[str, Any]:
    """Poll SQS for messages, process granular SES events, and delete consumed messages."""
    url = queue_url or settings.SQS_QUEUE_URL
    if not url:
        return {"processed": 0, "errors": 0, "status": "no_queue_url"}

    raw_messages = await asyncio.to_thread(
        _receive_messages_sync, url, max_messages, wait_seconds
    )

    if not raw_messages:
        return {"processed": 0, "errors": 0, "status": "no_messages"}

    processed_count = 0
    errors_count = 0
    events_summary = []

    for msg in raw_messages:
        receipt_handle = msg.get("ReceiptHandle")
        raw_body = msg.get("Body", "")

        try:
            outer = json.loads(raw_body)
            # SNS wraps the SES payload inside a 'Message' JSON string attribute
            if isinstance(outer, dict) and "Message" in outer and isinstance(outer["Message"], str):
                try:
                    ses_event = json.loads(outer["Message"])
                except Exception:
                    # Non-JSON SNS notification (e.g. topic subscription confirmation)
                    logger.info("Non-JSON SNS message received: %s", outer.get("Message"))
                    if receipt_handle:
                        await asyncio.to_thread(_delete_message_sync, url, receipt_handle)
                    continue
            elif isinstance(outer, dict):
                ses_event = outer
            else:
                continue

            event_summary = await process_sqs_event_payload(session, ses_event)
            events_summary.append(event_summary)
            processed_count += 1

            # Delete the message from SQS upon successful processing
            if receipt_handle:
                await asyncio.to_thread(_delete_message_sync, url, receipt_handle)

        except Exception as exc:
            errors_count += 1
            logger.exception("Error processing SQS message: %s", exc)

    await session.commit()

    return {
        "processed": processed_count,
        "errors": errors_count,
        "events": events_summary,
        "status": "success",
    }

