import datetime as dt

from sqlalchemy import select, update

from app.models.automation import AutomationEnrollment
from app.models.base import utcnow
from app.models.message import EmailMessage
from app.services import automation_service
from tests.conftest import make_contact

BASE = "/api/v1/automations"

NODES = [
    {"id": "t", "kind": "Trigger", "label": "Subscribes", "position": {"x": 0, "y": 0}},
    {
        "id": "e",
        "kind": "Email",
        "label": "Welcome",
        "config": {"subject": "Hello", "html": "<p>Hi {{first_name}}</p>"},
        "position": {"x": 0, "y": 140},
    },
    {
        "id": "d",
        "kind": "Delay",
        "label": "Wait",
        "config": {"amount": 2, "unit": "minutes"},
        "position": {"x": 0, "y": 280},
    },
    {
        "id": "c",
        "kind": "Condition",
        "label": "Clicked",
        "config": {"type": "clicked_previous"},
        "position": {"x": 0, "y": 420},
    },
    {
        "id": "tag",
        "kind": "Add tag",
        "label": "Mark click",
        "config": {"tag": "clicked"},
        "position": {"x": -160, "y": 560},
    },
    {"id": "end", "kind": "End", "label": "End", "position": {"x": 160, "y": 560}},
]
EDGES = [
    {"source": "t", "target": "e"},
    {"source": "e", "target": "d"},
    {"source": "d", "target": "c"},
    {"source": "c", "target": "tag", "sourceHandle": "true"},
    {"source": "c", "target": "end", "sourceHandle": "false"},
    {"source": "tag", "target": "end"},
]


async def _automation(client, **extra):
    body = {
        "name": "Welcome",
        "description": "New subscribers",
        "trigger": "Contact subscribes",
        "triggerType": "contact_subscribed",
        "nodes": NODES,
        "edges": EDGES,
        **extra,
    }
    resp = await client.post(BASE, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def test_draft_saves_graph_and_activation_rejects_a_broken_one(client):
    saved = await _automation(client)
    assert saved["status"] == "Draft"
    assert [edge["source"] for edge in saved["edges"]] == ["t", "e", "d", "c", "c", "tag"]

    again = await client.get(f"{BASE}/{saved['id']}")
    assert again.json()["data"]["nodes"][1]["config"]["subject"] == "Hello"

    broken = await _automation(client, name="Broken", nodes=[{"id": "t", "kind": "Trigger"}], edges=[])
    refused = await client.post(f"{BASE}/{broken['id']}/activate")
    assert refused.status_code == 409
    assert refused.json()["details"]

    untagged = [dict(node) for node in NODES]
    untagged[4] = {**untagged[4], "config": {"tag": " "}}
    blank = await _automation(client, name="No tag", nodes=untagged)
    check = (await client.post(f"{BASE}/{blank['id']}/validate")).json()["data"]
    assert check["ok"] is False
    assert check["problems"] == [{"nodeId": "tag", "message": "Step 'Mark click' needs a tag"}]


async def test_funnel_sends_waits_and_takes_the_click_branch(client, session, outbox):
    saved = await _automation(client)
    assert (await client.post(f"{BASE}/{saved['id']}/activate")).status_code == 200

    contact = await make_contact(client, "ada@example.com", name="Ada Lovelace")
    assert len(outbox.outbox) == 0

    assert await automation_service.process_due_enrollments(session) == 1
    assert len(outbox.outbox) == 1
    assert "Ada" in outbox.outbox[0].html

    waiting = (
        await session.execute(select(AutomationEnrollment).where(AutomationEnrollment.contact_id == contact["id"]))
    ).scalar_one()
    assert waiting.current_node_id == "d"
    waiting.next_run_at = utcnow() - dt.timedelta(minutes=1)
    message = (await session.execute(select(EmailMessage))).scalar_one()
    message.first_clicked_at = utcnow()
    await session.commit()

    assert await automation_service.process_due_enrollments(session) == 1
    listed = (await client.get("/api/v1/contacts")).json()["data"]
    ada = next(row for row in listed if row["email"] == "ada@example.com")
    assert "clicked" in ada["tags"]
    assert len(outbox.outbox) == 1

    replay = await client.post(
        f"{BASE}/events",
        json={"event": "contact_subscribed", "email": "ada@example.com"},
    )
    assert replay.json()["data"]["enrolled"] == 0
    assert await automation_service.process_due_enrollments(session) == 0
    assert len(outbox.outbox) == 1


async def test_pause_leaves_a_due_step_unclaimed(client, session, outbox):
    saved = await _automation(client)
    await client.post(f"{BASE}/{saved['id']}/activate")
    await make_contact(client, "bea@example.com", name="Bea")
    await automation_service.process_due_enrollments(session)
    assert (await client.post(f"{BASE}/{saved['id']}/pause")).status_code == 200
    await session.execute(
        update(AutomationEnrollment).values(next_run_at=utcnow() - dt.timedelta(minutes=1))
    )
    await session.commit()
    assert await automation_service.process_due_enrollments(session) == 0
    assert len(outbox.outbox) == 1


async def test_test_send_uses_the_chosen_step_and_follows_the_edges(client, outbox):
    template = (
        await client.post(
            "/api/v1/templates",
            json={"name": "Note", "subject": "From the template", "html": "<p>Template body</p>", "design": []},
        )
    ).json()["data"]
    nodes = [
        {"id": "t", "kind": "Trigger", "label": "Subscribes"},
        {"id": "late", "kind": "Email", "label": "Later", "config": {"subject": "Second", "html": "<p>Second</p>"}},
        {"id": "first", "kind": "Email", "label": "First", "config": {"templateId": template["id"]}},
        {"id": "end", "kind": "End", "label": "End"},
    ]
    edges = [
        {"source": "t", "target": "first"},
        {"source": "first", "target": "late"},
        {"source": "late", "target": "end"},
    ]
    saved = await _automation(client, nodes=nodes, edges=edges)

    default = await client.post(f"{BASE}/{saved['id']}/test", json={"email": "qa@example.com"})
    assert default.status_code == 200, default.text
    assert outbox.outbox[-1].subject == "[Test] From the template"
    assert "Template body" in outbox.outbox[-1].html

    chosen = await client.post(f"{BASE}/{saved['id']}/test", json={"email": "qa@example.com", "nodeId": "late"})
    assert chosen.status_code == 200, chosen.text
    assert outbox.outbox[-1].subject == "[Test] Second"

    wrong = await client.post(f"{BASE}/{saved['id']}/test", json={"email": "qa@example.com", "nodeId": "t"})
    assert wrong.status_code == 409


async def test_other_workspace_cannot_read_the_automation(client):
    saved = await _automation(client)
    other = await client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Other",
            "email": "other-auto@example.com",
            "password": "password123",
            "workspaceName": "Other Workspace",
            "mailingAddress": "1 Market Street",
            "fromName": "Other Workspace",
            "fromEmail": "other-auto-from@example.com",
        },
    )
    token = other.json()["data"]["accessToken"]
    client.headers["Authorization"] = f"Bearer {token}"
    assert (await client.get(f"{BASE}/{saved['id']}")).status_code == 404
