import datetime as dt

from sqlalchemy import select

from app.models import Campaign, EmailMessage
from app.workers.jobs import scheduler_tick
from tests.conftest import make_campaign, make_contact

BASE = "/api/v1/campaigns"


def _future(hours: int = 2) -> str:
    return (dt.datetime.now(dt.UTC) + dt.timedelta(hours=hours)).isoformat()


async def test_create_renders_design_and_counts_recipients(client):
    await make_contact(client, "a@example.com", tags=["VIP"])
    await make_contact(client, "b@example.com")
    await make_contact(client, "c@example.com", status="Unsubscribed", tags=["VIP"])

    campaign = await make_campaign(client, audience="VIP", audience_tags=["VIP"])
    assert campaign["status"] == "Draft"
    assert campaign["recipients"] == 1
    assert campaign["delivery"] is None and campaign["open"] is None
    assert "<h2" in campaign["html"] and "Hello {{first_name}}" in campaign["html"]

    everyone = await make_campaign(client)
    assert everyone["recipients"] == 2

    estimate = await client.get(f"{BASE}/estimate", params={"tags": ["VIP"]})
    assert estimate.json()["data"]["recipients"] == 1


async def test_create_from_template(client):
    tpl = await client.post(
        "/api/v1/templates",
        json={
            "name": "T",
            "subject": "From template",
            "design": [{"type": "heading", "text": "X"}],
        },
    )
    tpl_id = tpl.json()["data"]["id"]
    resp = await client.post(BASE, json={"name": "C", "templateId": tpl_id})
    data = resp.json()["data"]
    assert data["subject"] == "From template" and data["templateId"] == tpl_id
    assert "X" in data["html"]


async def test_schedule_lifecycle(client):
    campaign = await make_campaign(client)
    cid = campaign["id"]

    past = await client.post(f"{BASE}/{cid}/schedule", json={"scheduledAt": "2020-01-01T00:00:00Z"})
    assert past.status_code == 400 and past.json()["code"] == "invalid_schedule"

    naive = await client.post(f"{BASE}/{cid}/schedule", json={"scheduledAt": "2030-01-01T00:00"})
    assert naive.status_code == 422

    ok = await client.post(f"{BASE}/{cid}/schedule", json={"scheduledAt": _future()})
    assert ok.json()["data"]["status"] == "Scheduled"

    events = await client.get("/api/v1/calendar/upcoming")
    assert [e["campaignId"] for e in events.json()["data"]] == [cid]

    edited = await client.patch(f"{BASE}/{cid}", json={"name": "Renamed"})
    assert edited.status_code == 200

    cleared = await client.patch(f"{BASE}/{cid}", json={"subject": ""})
    assert cleared.status_code == 400  # scheduled campaigns must stay sendable

    back = await client.post(f"{BASE}/{cid}/unschedule")
    assert back.json()["data"]["status"] == "Draft"
    assert (await client.post(f"{BASE}/{cid}/unschedule")).status_code == 409


async def test_incomplete_campaign_cannot_send(client):
    resp = await client.post(BASE, json={"name": "Empty"})
    cid = resp.json()["data"]["id"]
    send = await client.post(f"{BASE}/{cid}/send")
    assert send.status_code == 400
    body = send.json()
    assert body["code"] == "campaign_incomplete" and len(body["details"]) == 2


async def test_send_now_dispatches_with_tracking(client, outbox, session):
    alice = await make_contact(client, "alice@example.com", name="Alice Smith", tags=["VIP"])
    await make_contact(client, "bob@example.com", name="Bob")
    await make_contact(client, "gone@example.com", tags=["VIP"], status="Unsubscribed")
    campaign = await make_campaign(client, audience_tags=["VIP"], preheader="Sneak peek")

    resp = await client.post(f"{BASE}/{campaign['id']}/send")
    assert resp.status_code == 202
    assert resp.json()["data"]["status"] == "Sending"

    # BackgroundTasks complete before the ASGI call returns under httpx.ASGITransport.
    detail = (await client.get(f"{BASE}/{campaign['id']}")).json()["data"]
    assert detail["status"] == "Sent"
    assert detail["recipients"] == 1 and detail["sentCount"] == 1
    assert detail["delivery"] == 100.0 and detail["open"] == 0.0

    assert len(outbox.outbox) == 1
    email = outbox.outbox[0]
    assert email.to == "alice@example.com"
    assert email.subject == "Hi Alice"
    assert "Hello Alice" in email.html
    assert "Sneak peek" in email.html
    assert "/api/v1/t/o/" in email.html  # open pixel
    assert "/api/v1/t/c/" in email.html and "shop.example.com" not in email.html  # click wrap
    assert "/api/v1/t/u/" in email.html  # unsubscribe link auto-added
    assert email.headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"

    messages = list(await session.scalars(select(EmailMessage)))
    assert [m.contact_id for m in messages] == [alice["id"]]

    again = await client.post(f"{BASE}/{campaign['id']}/send")
    assert again.status_code == 409
    assert (await client.patch(f"{BASE}/{campaign['id']}", json={"name": "x"})).status_code == 409


async def test_scheduler_dispatches_due_campaigns(client, outbox, session):
    await make_contact(client, "a@example.com")
    campaign = await make_campaign(client, scheduledAt=_future())
    assert campaign["status"] == "Scheduled"

    row = await session.get(Campaign, campaign["id"])
    row.scheduled_at = dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)
    await session.commit()

    result = await scheduler_tick()
    assert result["campaigns"] == 1
    from app.workers import jobs

    await jobs.wait_for_running_jobs()
    detail = (await client.get(f"{BASE}/{campaign['id']}")).json()["data"]
    assert detail["status"] == "Sent"
    assert len(outbox.outbox) == 1

    assert (await scheduler_tick())["campaigns"] == 0  # never dispatched twice


async def test_concurrent_dispatches_do_not_conflict(client, outbox, session):
    for i in range(5):
        await make_contact(client, f"r{i}@example.com")
    ids = [(await make_campaign(client, name=f"C{i}", scheduledAt=_future()))["id"] for i in range(3)]
    for cid in ids:
        (await session.get(Campaign, cid)).scheduled_at = dt.datetime.now(dt.UTC)
    await session.commit()
    await session.close()

    from app.workers import jobs

    assert (await scheduler_tick())["campaigns"] == 3
    await jobs.wait_for_running_jobs()
    statuses = [(await client.get(f"{BASE}/{cid}")).json()["data"]["status"] for cid in ids]
    assert statuses == ["Sent", "Sent", "Sent"]
    assert len(outbox.outbox) == 15


async def test_failed_delivery_marks_campaign_failed_and_retry_resumes(client, outbox, monkeypatch):
    from app.services import email_service

    await make_contact(client, "a@example.com")
    await make_contact(client, "b@example.com")
    campaign = await make_campaign(client)

    async def broken(email):
        raise email_service.EmailDeliveryError("SMTP down")

    monkeypatch.setattr(email_service, "send_email", broken)
    await client.post(f"{BASE}/{campaign['id']}/send")
    failed = (await client.get(f"{BASE}/{campaign['id']}")).json()["data"]
    assert failed["status"] == "Failed" and "failed" in failed["failureReason"]

    monkeypatch.undo()
    retry = await client.post(f"{BASE}/{campaign['id']}/send")
    assert retry.status_code == 202
    after = (await client.get(f"{BASE}/{campaign['id']}")).json()["data"]
    assert after["status"] == "Sent" and after["recipients"] == 2
    assert len(outbox.outbox) == 2

    # A second retry is impossible (Sent) and delivered recipients are never re-mailed.
    assert (await client.post(f"{BASE}/{campaign['id']}/send")).status_code == 409


async def test_test_send_and_duplicate_and_delete(client, outbox):
    campaign = await make_campaign(client)
    resp = await client.post(f"{BASE}/{campaign['id']}/test", json={"emails": ["qa@example.com"]})
    assert resp.json()["data"]["affected"] == 1
    assert outbox.outbox[0].subject.startswith("[Test] Hi Alex")

    dup = (await client.post(f"{BASE}/{campaign['id']}/duplicate")).json()["data"]
    assert dup["name"] == "Launch (copy)" and dup["status"] == "Draft"

    listed = (await client.get(BASE, params={"q": "copy"})).json()
    assert listed["total"] == 1

    assert (await client.delete(f"{BASE}/{campaign['id']}")).status_code == 200
    counts = (await client.get(f"{BASE}/stats")).json()["data"]
    assert counts["Draft"] == 1 and counts["Sent"] == 0


async def test_saved_html_is_kept_when_design_is_empty(client):
    campaign = await make_campaign(client)
    custom = "<html><body><h1>Custom code</h1></body></html>"
    updated = await client.patch(f"{BASE}/{campaign['id']}", json={"design": [], "html": custom})
    assert updated.status_code == 200, updated.text
    body = updated.json()["data"]
    assert body["design"] == []
    assert "Custom code" in body["html"]
    again = (await client.get(f"{BASE}/{campaign['id']}")).json()["data"]
    assert again["design"] == [] and "Custom code" in again["html"]
