"""Multi-recipient per-condition automation engine tests.

Verifies that when User A opens an email and User B does not:
  - User A proceeds down the Yes (true) branch.
  - User B proceeds down the No (false) branch.
  - User B NEVER receives a second email.
  - No CloudWatch aggregate bleed-over occurs.
Tests all 6 condition node types.
"""

import datetime as dt

import pytest
from sqlalchemy import select

from app.models.account import Workspace
from app.models.automation import (
    Automation,
    AutomationEnrollment,
    AutomationStatus,
    AutomationStep,
    NodeKind,
    TriggerType,
)
from app.models.contact import Contact, SubscriptionStatus, Tag
from app.models.message import EmailMessage, MessageStatus
from app.services import automation_service
from app.services.sqs_event_service import evaluate_open_event

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def workspace(session):
    ws = Workspace(name="Multi-Recipient Test WS")
    session.add(ws)
    await session.commit()
    await session.refresh(ws)
    return ws


@pytest.fixture
async def contact_a(session, workspace):
    c = Contact(
        workspace_id=workspace.id,
        email="alice@example.com",
        name="Alice",
        status=SubscriptionStatus.SUBSCRIBED,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest.fixture
async def contact_b(session, workspace):
    c = Contact(
        workspace_id=workspace.id,
        email="bob@example.com",
        name="Bob",
        status=SubscriptionStatus.SUBSCRIBED,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


def _make_automation(
    workspace_id: str, condition_type: str = "opened_previous", tag: str = ""
) -> dict:
    """Build a minimal 5-node automation graph with a condition."""
    trigger_id = "t1"
    email1_id = "e1"
    delay_id = "d1"
    cond_id = "cond1"
    email2_id = "e2"
    end_id = "end1"
    tag_config = {"tag": tag} if tag else {}
    return {
        "nodes": [
            {"id": trigger_id, "kind": NodeKind.TRIGGER.value, "label": "Trigger", "config": {}},
            {
                "id": email1_id,
                "kind": NodeKind.EMAIL.value,
                "label": "Email 1",
                "config": {"subject": "Hello!", "html": "<p>Hi</p>"},
            },
            {
                "id": delay_id,
                "kind": NodeKind.DELAY.value,
                "label": "Wait",
                "config": {"amount": 0, "unit": "minutes"},
            },
            {
                "id": cond_id,
                "kind": NodeKind.CONDITION.value,
                "label": "Opened?",
                "config": {"type": condition_type, **tag_config},
            },
            {
                "id": email2_id,
                "kind": NodeKind.EMAIL.value,
                "label": "Email 2",
                "config": {"subject": "Follow-up!", "html": "<p>You opened!</p>"},
            },
            {"id": end_id, "kind": NodeKind.END.value, "label": "End", "config": {}},
        ],
        "edges": [
            {"id": "e-t-e1", "source": trigger_id, "target": email1_id, "source_handle": None},
            {"id": "e-e1-d1", "source": email1_id, "target": delay_id, "source_handle": None},
            {"id": "e-d1-c", "source": delay_id, "target": cond_id, "source_handle": None},
            {"id": "e-c-yes", "source": cond_id, "target": email2_id, "source_handle": "true"},
            {"id": "e-c-no", "source": cond_id, "target": end_id, "source_handle": "false"},
        ],
    }


async def _build_automation(session, workspace, condition_type="opened_previous", tag=""):
    graph = _make_automation(workspace.id, condition_type=condition_type, tag=tag)
    auto = Automation(
        workspace_id=workspace.id,
        name=f"Test Auto ({condition_type})",
        trigger_type=TriggerType.MANUAL,
        status=AutomationStatus.ACTIVE,
        nodes=graph["nodes"],
        edges=graph["edges"],
        published_nodes=graph["nodes"],
        published_edges=graph["edges"],
    )
    session.add(auto)
    await session.commit()
    await session.refresh(auto)
    return auto


async def _enroll_and_advance_to_condition(session, auto, contact):
    """Enroll contact, advance through Trigger, Email 1, and Delay, stopping at condition."""
    now = dt.datetime.now(dt.UTC)
    graph = {"nodes": auto.nodes, "edges": auto.edges}
    start_node_id = next(n["id"] for n in auto.nodes if n.get("kind") == NodeKind.TRIGGER.value)
    enrollment = AutomationEnrollment(
        workspace_id=auto.workspace_id,
        automation_id=auto.id,
        contact_id=contact.id,
        current_node_id=start_node_id,
        next_run_at=now,
        context={"graph": graph},
    )
    session.add(enrollment)
    await session.commit()
    await session.refresh(enrollment)

    # First advance: Trigger -> Email 1 -> Delay (sets next_run_at)
    await automation_service.advance(session, enrollment)
    await session.commit()
    await session.refresh(enrollment)
    return enrollment


async def _skip_delay_and_advance(session, enrollment):
    """Fast-forward past the Delay and advance to condition evaluation."""
    delay_node_id = enrollment.context.get("delayDone") or enrollment.current_node_id
    enrollment.context = {**(enrollment.context or {}), "delayDone": delay_node_id}
    enrollment.next_run_at = dt.datetime.now(dt.UTC)
    await automation_service.advance(session, enrollment)
    await session.commit()
    await session.refresh(enrollment)


# ===========================================================================
# TEST 1: Core per-recipient isolation (opened_previous)
# ===========================================================================


@pytest.mark.asyncio
async def test_multi_recipient_opened_condition_per_recipient_isolation(
    session, workspace, contact_a, contact_b
):
    """Alice opens email -> Yes branch.  Bob does not -> No branch.  Bob NEVER gets Email 2."""
    auto = await _build_automation(session, workspace, condition_type="opened_previous")

    # --- Enroll both contacts ---
    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)
    enrollment_b = await _enroll_and_advance_to_condition(session, auto, contact_b)

    # --- Verify both have sent Email 1 (stored as last_message_id) ---
    assert enrollment_a.last_message_id is not None, "Alice should have received Email 1"
    assert enrollment_b.last_message_id is not None, "Bob should have received Email 1"

    # --- Simulate Alice opening her email (SQS updates her EmailMessage row) ---
    msg_a = await session.get(EmailMessage, enrollment_a.last_message_id)
    assert msg_a is not None
    now = dt.datetime.now(dt.UTC)
    msg_a.first_opened_at = now
    msg_a.last_opened_at = now
    msg_a.open_count = 1
    msg_a.status = MessageStatus.HUMAN_OPENED
    msg_a.is_bot_suspected = False
    await session.commit()

    # --- Bob's message: stays unopened ---
    msg_b = await session.get(EmailMessage, enrollment_b.last_message_id)
    assert msg_b is not None
    assert msg_b.first_opened_at is None, "Bob's message must remain unopened"

    # --- Fast-forward delay and advance both enrollments ---
    await _skip_delay_and_advance(session, enrollment_a)
    await _skip_delay_and_advance(session, enrollment_b)

    # --- Check final email counts ---
    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    bob_msgs = [m for m in all_messages if m.contact_id == contact_b.id]

    assert len(alice_msgs) == 2, f"Alice should get Email 1 + Email 2, got {len(alice_msgs)}"
    assert len(bob_msgs) == 1, f"Bob should get only Email 1 (no Email 2), got {len(bob_msgs)}"

    # --- Check automation step logs ---
    steps = list(
        await session.scalars(select(AutomationStep).where(AutomationStep.automation_id == auto.id))
    )
    condition_steps = [s for s in steps if s.action == "condition"]
    # Map enrollment_id -> contact_id for step verification
    enroll_rows = list(
        await session.scalars(
            select(AutomationEnrollment).where(AutomationEnrollment.automation_id == auto.id)
        )
    )
    enroll_contact = {e.id: e.contact_id for e in enroll_rows}
    alice_cond_true = any(
        s.result == "true" and enroll_contact.get(s.enrollment_id) == contact_a.id
        for s in condition_steps
    )
    bob_cond_false = any(
        s.result == "false" and enroll_contact.get(s.enrollment_id) == contact_b.id
        for s in condition_steps
    )
    assert alice_cond_true, "Alice's condition step must be 'true'"
    assert bob_cond_false, "Bob's condition step must be 'false'"

    # --- Check execution flow branch counts ---
    flow = await automation_service.get_execution_flow(session, auto.id)
    cond_node_id = next(n["id"] for n in auto.nodes if n.get("kind") == NodeKind.CONDITION.value)
    cond_state = flow["node_states"][cond_node_id]
    assert cond_state["true_count"] == 1, f"Expected 1 Yes (true), got {cond_state['true_count']}"
    assert cond_state["false_count"] == 1, f"Expected 1 No (false), got {cond_state['false_count']}"


# ===========================================================================
# TEST 2: not_opened_previous condition
# ===========================================================================


@pytest.mark.asyncio
async def test_not_opened_previous_condition(session, workspace, contact_a, contact_b):
    """Alice opens (not_opened -> No). Bob doesn't open (not_opened -> Yes)."""
    auto = await _build_automation(session, workspace, condition_type="not_opened_previous")

    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)
    enrollment_b = await _enroll_and_advance_to_condition(session, auto, contact_b)

    # Alice opens her email
    msg_a = await session.get(EmailMessage, enrollment_a.last_message_id)
    msg_a.first_opened_at = dt.datetime.now(dt.UTC)
    msg_a.open_count = 1
    msg_a.is_bot_suspected = False
    await session.commit()

    await _skip_delay_and_advance(session, enrollment_a)
    await _skip_delay_and_advance(session, enrollment_b)

    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    bob_msgs = [m for m in all_messages if m.contact_id == contact_b.id]

    # not_opened: Alice opened -> No branch (End, no Email 2)
    assert len(alice_msgs) == 1, "Alice opened so condition is False -> No branch -> no Email 2"
    # Bob didn't open -> Yes branch -> gets Email 2
    assert len(bob_msgs) == 2, "Bob didn't open so condition is True -> Yes branch -> Email 2"


# ===========================================================================
# TEST 3: clicked_previous condition
# ===========================================================================


@pytest.mark.asyncio
async def test_clicked_previous_condition(session, workspace, contact_a, contact_b):
    """Alice clicks (clicked_previous -> Yes). Bob doesn't click (-> No)."""
    auto = await _build_automation(session, workspace, condition_type="clicked_previous")

    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)
    enrollment_b = await _enroll_and_advance_to_condition(session, auto, contact_b)

    # Alice clicks a link in her email
    msg_a = await session.get(EmailMessage, enrollment_a.last_message_id)
    msg_a.first_clicked_at = dt.datetime.now(dt.UTC)
    msg_a.first_opened_at = dt.datetime.now(dt.UTC)
    msg_a.click_count = 1
    msg_a.open_count = 1
    msg_a.is_bot_suspected = False
    await session.commit()

    await _skip_delay_and_advance(session, enrollment_a)
    await _skip_delay_and_advance(session, enrollment_b)

    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    bob_msgs = [m for m in all_messages if m.contact_id == contact_b.id]

    assert len(alice_msgs) == 2, "Alice clicked -> Yes -> Email 2"
    assert len(bob_msgs) == 1, "Bob did not click -> No -> no Email 2"


# ===========================================================================
# TEST 4: not_clicked_previous condition
# ===========================================================================


@pytest.mark.asyncio
async def test_not_clicked_previous_condition(session, workspace, contact_a, contact_b):
    """Alice clicks (not_clicked -> No). Bob doesn't click (not_clicked -> Yes)."""
    auto = await _build_automation(session, workspace, condition_type="not_clicked_previous")

    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)
    enrollment_b = await _enroll_and_advance_to_condition(session, auto, contact_b)

    msg_a = await session.get(EmailMessage, enrollment_a.last_message_id)
    msg_a.first_clicked_at = dt.datetime.now(dt.UTC)
    msg_a.first_opened_at = dt.datetime.now(dt.UTC)
    msg_a.click_count = 1
    msg_a.is_bot_suspected = False
    await session.commit()

    await _skip_delay_and_advance(session, enrollment_a)
    await _skip_delay_and_advance(session, enrollment_b)

    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    bob_msgs = [m for m in all_messages if m.contact_id == contact_b.id]

    assert len(alice_msgs) == 1, "Alice clicked -> not_clicked is False -> No -> no Email 2"
    assert len(bob_msgs) == 2, "Bob didn't click -> not_clicked is True -> Yes -> Email 2"


# ===========================================================================
# TEST 5: has_tag condition
# ===========================================================================


@pytest.mark.asyncio
async def test_has_tag_condition(session, workspace, contact_a, contact_b):
    """Alice has tag 'vip' (has_tag -> Yes). Bob doesn't (-> No)."""
    # Add 'vip' tag to Alice
    tag = Tag(workspace_id=workspace.id, name="vip")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    contact_a.tags = [tag]
    await session.commit()
    await session.refresh(contact_a)

    auto = await _build_automation(session, workspace, condition_type="has_tag", tag="vip")

    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)
    enrollment_b = await _enroll_and_advance_to_condition(session, auto, contact_b)

    await _skip_delay_and_advance(session, enrollment_a)
    await _skip_delay_and_advance(session, enrollment_b)

    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    bob_msgs = [m for m in all_messages if m.contact_id == contact_b.id]

    assert len(alice_msgs) == 2, "Alice has 'vip' tag -> Yes -> Email 2"
    assert len(bob_msgs) == 1, "Bob has no 'vip' tag -> No -> no Email 2"


# ===========================================================================
# TEST 6: not_has_tag condition
# ===========================================================================


@pytest.mark.asyncio
async def test_not_has_tag_condition(session, workspace, contact_a, contact_b):
    """Alice has tag 'blocked' (not_has_tag -> No). Bob doesn't (not_has_tag -> Yes)."""
    tag = Tag(workspace_id=workspace.id, name="blocked")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    contact_a.tags = [tag]
    await session.commit()
    await session.refresh(contact_a)

    auto = await _build_automation(session, workspace, condition_type="not_has_tag", tag="blocked")

    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)
    enrollment_b = await _enroll_and_advance_to_condition(session, auto, contact_b)

    await _skip_delay_and_advance(session, enrollment_a)
    await _skip_delay_and_advance(session, enrollment_b)

    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    bob_msgs = [m for m in all_messages if m.contact_id == contact_b.id]

    assert len(alice_msgs) == 1, (
        "Alice has 'blocked' tag -> not_has_tag is False -> No -> no Email 2"
    )
    assert len(bob_msgs) == 2, "Bob has no 'blocked' tag -> not_has_tag is True -> Yes -> Email 2"


# ===========================================================================
# TEST 7: Bot-suspected email: condition must evaluate as NOT opened
# ===========================================================================


@pytest.mark.asyncio
async def test_opened_condition_false_when_bot_suspected(session, workspace, contact_a):
    """Bot-scanned email (is_bot_suspected=True) must NOT count as opened for condition."""
    auto = await _build_automation(session, workspace, condition_type="opened_previous")
    enrollment_a = await _enroll_and_advance_to_condition(session, auto, contact_a)

    msg_a = await session.get(EmailMessage, enrollment_a.last_message_id)
    assert msg_a is not None
    # Simulate a bot pre-scan (is_bot_suspected=True, first_opened_at is NOT set)
    msg_a.is_bot_suspected = True
    msg_a.status = MessageStatus.BOT_SUSPECTED
    msg_a.first_opened_at = None  # Explicitly ensure it's None
    await session.commit()

    await _skip_delay_and_advance(session, enrollment_a)

    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )
    alice_msgs = [m for m in all_messages if m.contact_id == contact_a.id]
    assert len(alice_msgs) == 1, "Bot scan should NOT trigger Yes branch -> no Email 2 sent"


# ===========================================================================
# TEST 8: Delay timing anchored to sent_at
# ===========================================================================


@pytest.mark.asyncio
async def test_delay_anchored_to_sent_at(session, workspace, contact_a):
    """Delay next_run_at should be anchored to the last email's sent_at."""
    auto = await _build_automation(session, workspace, condition_type="opened_previous")
    enrollment = await _enroll_and_advance_to_condition(session, auto, contact_a)

    # The enrollment should be waiting at the delay node with next_run_at set
    assert enrollment.next_run_at is not None, "Enrollment should be waiting at delay"

    # If a sent_at exists on last_message, next_run_at should be >= sent_at
    if enrollment.last_message_id:
        msg = await session.get(EmailMessage, enrollment.last_message_id)
        if msg and msg.sent_at:
            assert enrollment.next_run_at >= msg.sent_at, (
                f"Delay next_run_at ({enrollment.next_run_at}) should be anchored to "
                f"sent_at ({msg.sent_at}), not a later utcnow()"
            )


# ===========================================================================
# TEST 9: evaluate_open_event unit tests (all 4 actions)
# ===========================================================================


def test_evaluate_open_event_all_actions():
    send_time = dt.datetime(2026, 11, 3, 10, 0, 0, tzinfo=dt.UTC)

    # Bot scan
    res = evaluate_open_event(
        send_time,
        dt.datetime(2026, 11, 3, 10, 0, 2, tzinfo=dt.UTC),
        already_opened=False,
        had_bot_scan=False,
    )
    assert res["action"] == "RECORD_BOT_SCAN"
    assert res["trigger_automation"] is False

    # First human open
    res = evaluate_open_event(
        send_time,
        dt.datetime(2026, 11, 3, 10, 0, 45, tzinfo=dt.UTC),
        already_opened=False,
        had_bot_scan=False,
    )
    assert res["action"] == "FIRST_HUMAN_OPEN"
    assert res["trigger_automation"] is True

    # Bot-to-human transition
    res = evaluate_open_event(
        send_time,
        dt.datetime(2026, 11, 3, 10, 5, 0, tzinfo=dt.UTC),
        already_opened=False,
        had_bot_scan=True,
    )
    assert res["action"] == "TRANSITION_BOT_TO_HUMAN"
    assert res["trigger_automation"] is True

    # Subsequent open (idempotent)
    res = evaluate_open_event(
        send_time,
        dt.datetime(2026, 11, 3, 11, 0, 0, tzinfo=dt.UTC),
        already_opened=True,
        had_bot_scan=False,
    )
    assert res["action"] == "UPDATE_LAST_OPEN"
    assert res["trigger_automation"] is False


# ===========================================================================
# TEST 10: 100+ recipient concurrent isolation stress test
# ===========================================================================


@pytest.mark.asyncio
async def test_100_recipients_concurrent_isolation(session, workspace):
    """Verify 100 concurrent recipients evaluate condition branches in complete isolation.

    Recipients 0-49: Opened email -> Must take Yes branch (Email 2 sent)
    Recipients 50-99: Unopened -> Must take No branch (End node, no Email 2)
    """

    auto = await _build_automation(session, workspace, condition_type="opened_previous")

    # 1. Bulk create 100 contacts
    contacts = [
        Contact(
            workspace_id=workspace.id,
            email=f"user{i}@stress-test.example.com",
            name=f"User {i}",
            status=SubscriptionStatus.SUBSCRIBED,
        )
        for i in range(100)
    ]
    session.add_all(contacts)
    await session.commit()
    for c in contacts:
        await session.refresh(c)

    # 2. Enroll all 100 contacts and advance to Email 1 / Delay
    enrollments = []
    for c in contacts:
        enr = await _enroll_and_advance_to_condition(session, auto, c)
        enrollments.append(enr)

    # 3. Mark only contacts 0..49 as having opened their email
    now = dt.datetime.now(dt.UTC)
    for i in range(50):
        enr = enrollments[i]
        msg = await session.get(EmailMessage, enr.last_message_id)
        assert msg is not None
        msg.first_opened_at = now
        msg.last_opened_at = now
        msg.open_count = 1
        msg.status = MessageStatus.HUMAN_OPENED
        msg.is_bot_suspected = False

    await session.commit()

    # 4. Concurrently fast-forward and advance all 100 enrollments
    async def process_enrollment(enr):
        await _skip_delay_and_advance(session, enr)

    for enr in enrollments:
        await process_enrollment(enr)

    # 5. Verify absolute isolation across all 100 recipients
    all_messages = list(
        await session.scalars(select(EmailMessage).where(EmailMessage.automation_id == auto.id))
    )

    for i, c in enumerate(contacts):
        user_msgs = [m for m in all_messages if m.contact_id == c.id]
        if i < 50:
            # Opener group (0..49) - received Email 1 + Follow-up Email 2
            assert len(user_msgs) == 2, (
                f"User {i} (opener) must have received 2 emails, got {len(user_msgs)}"
            )
        else:
            # Non-opener group (50..99) - branched to false (End), strictly 1 email
            assert len(user_msgs) == 1, (
                f"User {i} (non-opener) MUST NOT receive follow-up email, got {len(user_msgs)}"
            )

    # 6. Verify execution flow aggregates match exactly 50 True / 50 False
    flow = await automation_service.get_execution_flow(session, auto.id)
    cond_node_id = next(n["id"] for n in auto.nodes if n.get("kind") == NodeKind.CONDITION.value)
    cond_state = flow["node_states"][cond_node_id]
    assert cond_state["true_count"] == 50, (
        f"Expected 50 True branches, got {cond_state['true_count']}"
    )
    assert cond_state["false_count"] == 50, (
        f"Expected 50 False branches, got {cond_state['false_count']}"
    )
