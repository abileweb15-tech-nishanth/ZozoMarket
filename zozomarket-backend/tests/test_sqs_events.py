import datetime as dt
import json
import pytest
from sqlalchemy import select

from app.models.account import Workspace
from app.models.automation import AutomationEnrollment, EnrollmentStatus
from app.models.message import EmailMessage, MessageStatus
from app.services import sqs_event_service, automation_service


@pytest.fixture
async def workspace_id(session):
    ws = Workspace(name="Test SQS Workspace")
    session.add(ws)
    await session.commit()
    await session.refresh(ws)
    return ws.id


@pytest.mark.asyncio
async def test_sqs_process_open_event(session, workspace_id):
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="subscriber@example.com",
        subject="Welcome",
        provider_message_id="ses-msg-open-001",
        status=MessageStatus.SENT,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    assert not msg.opened
    assert msg.open_count == 0

    ses_event = {
        "eventType": "Open",
        "mail": {
            "messageId": "ses-msg-open-001",
            "destination": ["subscriber@example.com"],
        },
        "open": {
            "timestamp": "2026-11-02T14:00:00.000Z",
            "userAgent": "Mozilla/5.0",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert result["email_message_id"] == msg.id
    assert msg.opened is True
    assert msg.open_count == 1
    assert msg.first_opened_at is not None


@pytest.mark.asyncio
async def test_sqs_process_click_event(session, workspace_id):
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="subscriber@example.com",
        subject="Special Offer",
        provider_message_id="ses-msg-click-002",
        status=MessageStatus.SENT,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    ses_event = {
        "eventType": "Click",
        "mail": {
            "messageId": "ses-msg-click-002",
            "destination": ["subscriber@example.com"],
        },
        "click": {
            "timestamp": "2026-11-02T14:05:00.000Z",
            "link": "https://zozomarket.local/products/item-1",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert msg.clicked is True
    assert msg.opened is True  # A click proves the email was opened
    assert msg.click_count == 1
    assert msg.last_clicked_url == "https://zozomarket.local/products/item-1"


@pytest.mark.asyncio
async def test_sqs_process_bounce_event(session, workspace_id):
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="bounced@example.com",
        subject="Newsletter",
        provider_message_id="ses-msg-bounce-003",
        status=MessageStatus.SENT,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    ses_event = {
        "eventType": "Bounce",
        "mail": {
            "messageId": "ses-msg-bounce-003",
            "destination": ["bounced@example.com"],
        },
        "bounce": {
            "bounceType": "Permanent",
            "bounceSubType": "General",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert msg.bounced is True
    assert msg.status == MessageStatus.BOUNCED


@pytest.mark.asyncio
async def test_sqs_process_delivery_event(session, workspace_id):
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="delivered@example.com",
        subject="Order Confirmation",
        provider_message_id="ses-msg-deliv-004",
        status=MessageStatus.QUEUED,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    ses_event = {
        "eventType": "Delivery",
        "mail": {
            "messageId": "ses-msg-deliv-004",
            "destination": ["delivered@example.com"],
        },
        "delivery": {
            "timestamp": "2026-11-02T14:10:00.000Z",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert msg.status == MessageStatus.DELIVERED
    assert msg.delivered_at is not None
