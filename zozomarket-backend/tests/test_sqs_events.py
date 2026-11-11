import datetime as dt

import pytest

from app.models.account import Workspace
from app.models.message import EmailMessage, MessageStatus
from app.services import sqs_event_service
from app.services.sqs_event_service import evaluate_open_event


@pytest.fixture
async def workspace_id(session):
    ws = Workspace(name="Test SQS Workspace")
    session.add(ws)
    await session.commit()
    await session.refresh(ws)
    return ws.id


def test_evaluate_open_event_logic():
    send_time = dt.datetime(2026, 11, 3, 10, 0, 0, tzinfo=dt.UTC)

    # 1. Bot scan (< 5.0 seconds)
    open_bot = dt.datetime(2026, 11, 3, 10, 0, 2, tzinfo=dt.UTC)  # 2.0s
    res_bot = evaluate_open_event(
        send_timestamp=send_time,
        open_timestamp=open_bot,
        already_opened=False,
        had_bot_scan=False,
        threshold_seconds=5.0,
    )
    assert res_bot["action"] == "RECORD_BOT_SCAN"
    assert res_bot["is_bot"] is True
    assert res_bot["is_human"] is False
    assert res_bot["trigger_automation"] is False
    assert res_bot["time_diff"] == 2.0

    # 2. First human open (>= 5.0 seconds)
    open_human = dt.datetime(2026, 11, 3, 10, 0, 45, tzinfo=dt.UTC)  # 45.0s
    res_human = evaluate_open_event(
        send_timestamp=send_time,
        open_timestamp=open_human,
        already_opened=False,
        had_bot_scan=False,
        threshold_seconds=5.0,
    )
    assert res_human["action"] == "FIRST_HUMAN_OPEN"
    assert res_human["is_human"] is True
    assert res_human["is_bot"] is False
    assert res_human["trigger_automation"] is True
    assert res_human["time_diff"] == 45.0

    # 3. Bot-to-human transition (had_bot_scan=True, human opens later)
    open_transition = dt.datetime(2026, 11, 3, 10, 5, 0, tzinfo=dt.UTC)  # 300.0s
    res_trans = evaluate_open_event(
        send_timestamp=send_time,
        open_timestamp=open_transition,
        already_opened=False,
        had_bot_scan=True,
        threshold_seconds=5.0,
    )
    assert res_trans["action"] == "TRANSITION_BOT_TO_HUMAN"
    assert res_trans["is_human"] is True
    assert res_trans["is_bot"] is False
    assert res_trans["trigger_automation"] is True

    # 4. Subsequent open (already_opened=True)
    open_subsequent = dt.datetime(2026, 11, 3, 11, 0, 0, tzinfo=dt.UTC)
    res_subseq = evaluate_open_event(
        send_timestamp=send_time,
        open_timestamp=open_subsequent,
        already_opened=True,
        had_bot_scan=False,
        threshold_seconds=5.0,
    )
    assert res_subseq["action"] == "UPDATE_LAST_OPEN"
    assert res_subseq["is_human"] is True
    assert res_subseq["is_bot"] is False
    assert res_subseq["trigger_automation"] is False


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
    assert msg.last_opened_at is not None
    assert msg.status == MessageStatus.HUMAN_OPENED


@pytest.mark.asyncio
async def test_sqs_process_bot_scan_event(session, workspace_id):
    send_dt = dt.datetime(2026, 11, 3, 12, 0, 0, tzinfo=dt.UTC)
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="bot-probe@example.com",
        subject="Quick Check",
        provider_message_id="ses-msg-bot-001",
        status=MessageStatus.SENT,
        sent_at=send_dt,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    # Open event occurs 1.5 seconds after send (< 5.0 seconds threshold)
    ses_event = {
        "eventType": "Open",
        "mail": {
            "messageId": "ses-msg-bot-001",
            "destination": ["bot-probe@example.com"],
            "timestamp": "2026-11-03T12:00:00.000Z",
        },
        "open": {
            "timestamp": "2026-11-03T12:00:01.500Z",
            "userAgent": "Barracuda Antivirus Probe",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert "bot_scan_recorded" in result["action_taken"]
    assert msg.is_bot_suspected is True
    assert msg.status == MessageStatus.BOT_SUSPECTED
    assert msg.opened is False
    assert msg.open_count == 0
    assert msg.bot_scan_at is not None
    assert msg.last_bot_scan_at is not None
    assert msg.first_opened_at is None


@pytest.mark.asyncio
async def test_sqs_process_bot_to_human_transition(session, workspace_id):
    send_dt = dt.datetime(2026, 11, 3, 12, 0, 0, tzinfo=dt.UTC)
    bot_dt = dt.datetime(2026, 11, 3, 12, 0, 2, tzinfo=dt.UTC)
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="human-reader@example.com",
        subject="Important Update",
        provider_message_id="ses-msg-transition-001",
        status=MessageStatus.BOT_SUSPECTED,
        sent_at=send_dt,
        bot_scan_at=bot_dt,
        last_bot_scan_at=bot_dt,
        is_bot_suspected=True,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    assert msg.is_bot_suspected is True
    assert msg.opened is False

    # Human opens 5 minutes later
    ses_event = {
        "eventType": "Open",
        "mail": {
            "messageId": "ses-msg-transition-001",
            "destination": ["human-reader@example.com"],
            "timestamp": "2026-11-03T12:00:00.000Z",
        },
        "open": {
            "timestamp": "2026-11-03T12:05:00.000Z",
            "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert "bot_to_human_transition" in result["action_taken"]
    assert msg.is_bot_suspected is False
    assert msg.status == MessageStatus.HUMAN_OPENED
    assert msg.opened is True
    assert msg.open_count == 1
    assert msg.first_opened_at is not None
    assert msg.last_opened_at is not None


@pytest.mark.asyncio
async def test_sqs_process_subsequent_human_open(session, workspace_id):
    send_dt = dt.datetime(2026, 11, 3, 12, 0, 0, tzinfo=dt.UTC)
    first_open_dt = dt.datetime(2026, 11, 3, 12, 10, 0, tzinfo=dt.UTC)
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="subscriber-repeat@example.com",
        subject="Special Deal",
        provider_message_id="ses-msg-repeat-001",
        status=MessageStatus.HUMAN_OPENED,
        sent_at=send_dt,
        first_opened_at=first_open_dt,
        last_opened_at=first_open_dt,
        open_count=1,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    # Subsequent open 3 hours later
    ses_event = {
        "eventType": "Open",
        "mail": {
            "messageId": "ses-msg-repeat-001",
            "destination": ["subscriber-repeat@example.com"],
            "timestamp": "2026-11-03T12:00:00.000Z",
        },
        "open": {
            "timestamp": "2026-11-03T15:10:00.000Z",
            "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert "subsequent_open" in result["action_taken"]
    assert msg.open_count == 2
    assert msg.first_opened_at == first_open_dt
    assert msg.last_opened_at.isoformat().startswith("2026-11-03T15:10:00")


@pytest.mark.asyncio
async def test_sqs_process_click_clears_bot_suspicion(session, workspace_id):
    msg = EmailMessage(
        workspace_id=workspace_id,
        to_email="bot-then-click@example.com",
        subject="Promo",
        provider_message_id="ses-msg-click-bot-001",
        status=MessageStatus.BOT_SUSPECTED,
        is_bot_suspected=True,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    assert msg.is_bot_suspected is True
    assert msg.opened is False

    ses_event = {
        "eventType": "Click",
        "mail": {
            "messageId": "ses-msg-click-bot-001",
            "destination": ["bot-then-click@example.com"],
        },
        "click": {
            "timestamp": "2026-11-03T12:08:00.000Z",
            "link": "https://zozomarket.local/catalog",
        },
    }

    result = await sqs_event_service.process_sqs_event_payload(session, ses_event)
    await session.commit()
    await session.refresh(msg)

    assert result["matched"] is True
    assert msg.is_bot_suspected is False
    assert msg.status == MessageStatus.HUMAN_OPENED
    assert msg.opened is True
    assert msg.clicked is True
    assert msg.click_count == 1
    assert msg.last_clicked_url == "https://zozomarket.local/catalog"


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
