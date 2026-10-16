import datetime as dt

from sqlalchemy import select

from app.models import AutomationEnrollment, EmailMessage, EnrollmentStatus
from app.services import automation_service
from tests.conftest import make_contact

BASE = "/api/v1/automations"

WELCOME_NODES = [
    {"kind": "Trigger", "label": "Contact subscribes"},
    {
        "kind": "Email",
        "label": "Welcome",
        "config": {"subject": "Welcome {{first_name}}", "body": "Glad you're here."},
    },
    {"kind": "Delay", "label": "Wait 2 days"},
    {"kind": "Condition", "label": "Opened previous email?"},
    {
        "kind": "Email",
        "label": "Follow-up",
        "config": {"subject": "Next steps", "html": "<p>Hi</p>"},
    },
]


async def _welcome(client, **extra):
    resp = await client.post(
        BASE,
        json={
            "name": "Welcome",
            "triggerType": "contact_subscribed",
            "nodes": WELCOME_NODES,
            **extra,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def test_create_validates_and_appends_end(client):
    bad = await client.post(BASE, json={"name": "x", "nodes": [{"kind": "Email"}]})
    assert bad.status_code == 422

    automation = await _welcome(client)
    assert automation["status"] == "Draft"
    assert automation["nodes"][-1]["kind"] == "End"
    assert all(n["id"] for n in automation["nodes"])


async def test_activation_requires_complete_email_steps(client):
    resp = await client.post(
        BASE,
        json={
            "name": "Incomplete",
            "nodes": [{"kind": "Trigger"}, {"kind": "Email", "label": "?"}],
        },
    )
    aid = resp.json()["data"]["id"]
    act = await client.post(f"{BASE}/{aid}/activate")
    assert act.status_code == 409 and act.json()["code"] == "invalid_state"

    automation = await _welcome(client)
    ok = await client.post(f"{BASE}/{automation['id']}/activate")
    assert ok.json()["data"]["status"] == "Active"
    paused = await client.post(f"{BASE}/{automation['id']}/pause")
    assert paused.json()["data"]["status"] == "Paused"


async def test_subscribe_trigger_runs_workflow(client, outbox, session):
    automation = await _welcome(client)
    await client.post(f"{BASE}/{automation['id']}/activate")

    contact = await make_contact(client, "new@example.com", name="Nina")
    enrollment = await session.scalar(select(AutomationEnrollment))
    assert enrollment is not None and enrollment.contact_id == contact["id"]

    assert await automation_service.process_due_enrollments(session) == 1
    assert [e.subject for e in outbox.outbox] == ["Welcome Nina"]
    await session.refresh(enrollment)
    assert enrollment.current_step == 3  # parked after the Delay node
    wait = enrollment.next_run_at - dt.datetime.now(dt.UTC)
    assert dt.timedelta(days=1, hours=23) < wait <= dt.timedelta(days=2)

    # Not due yet -> nothing happens.
    assert await automation_service.process_due_enrollments(session) == 0

    # Fast-forward: the contact never opened the welcome email -> condition exits.
    enrollment.next_run_at = dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1)
    await session.commit()
    assert await automation_service.process_due_enrollments(session) == 1
    await session.refresh(enrollment)
    assert enrollment.status is EnrollmentStatus.EXITED
    assert len(outbox.outbox) == 1


async def test_condition_true_continues_and_completes(client, outbox, session):
    automation = await _welcome(client)
    await client.post(f"{BASE}/{automation['id']}/activate")
    await make_contact(client, "fan@example.com")
    await automation_service.process_due_enrollments(session)

    message = await session.scalar(select(EmailMessage))
    message.first_opened_at = dt.datetime.now(dt.UTC)
    enrollment = await session.scalar(select(AutomationEnrollment))
    enrollment.next_run_at = dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1)
    await session.commit()

    await automation_service.process_due_enrollments(session)
    await session.refresh(enrollment)
    assert enrollment.status is EnrollmentStatus.COMPLETED
    assert [e.subject for e in outbox.outbox] == ["Welcome there", "Next steps"]
    stats = (await client.get(f"{BASE}/{automation['id']}")).json()["data"]
    assert stats["enrolledCount"] == 1 and stats["completedCount"] == 1


async def test_tag_trigger_and_external_events(client, session):
    tag_auto = await client.post(
        BASE,
        json={
            "name": "VIP",
            "triggerType": "tag_added",
            "triggerConfig": {"tag": "VIP"},
            "nodes": WELCOME_NODES,
        },
    )
    order_auto = await client.post(
        BASE, json={"name": "Orders", "triggerType": "order_completed", "nodes": WELCOME_NODES}
    )
    for resp in (tag_auto, order_auto):
        await client.post(f"{BASE}/{resp.json()['data']['id']}/activate")

    contact = await make_contact(client, "t@example.com")
    await client.post("/api/v1/contacts/bulk-tag", json={"ids": [contact["id"]], "tag": "Other"})
    await client.post("/api/v1/contacts/bulk-tag", json={"ids": [contact["id"]], "tag": "VIP"})
    event = await client.post(
        f"{BASE}/events", json={"event": "order_completed", "email": "buyer@example.com"}
    )
    assert event.json()["data"]["enrolled"] == 1

    rows = list(await session.scalars(select(AutomationEnrollment)))
    assert len(rows) == 2

    dup = await client.post(
        f"{BASE}/{tag_auto.json()['data']['id']}/enroll", json={"contactIds": [contact["id"]]}
    )
    assert dup.json()["data"]["enrolled"] == 0  # one enrollment per contact per workflow


def test_delay_parsing():
    assert automation_service.delay_seconds({"label": "Wait 3 hours"}) == 3 * 3600
    assert automation_service.delay_seconds({"config": {"amount": 2, "unit": "weeks"}}) == 1209600
    assert automation_service.delay_seconds({"label": "Wait a bit"}) == 86400
