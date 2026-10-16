import hashlib
import hmac
import json
import re

from sqlalchemy import select

from app.models import EmailMessage
from tests.conftest import make_campaign, make_contact


async def _sent_campaign(client, outbox):
    contact = await make_contact(client, "reader@example.com", name="Reader")
    campaign = await make_campaign(client)
    await client.post(f"/api/v1/campaigns/{campaign['id']}/send")
    html = outbox.outbox[-1].html

    def path(kind: str) -> str:
        match = re.search(rf'http://testserver(/api/v1/t/{kind}/[^"]+)"', html)
        assert match, f"no {kind} link in email"
        return match.group(1)

    return contact, campaign, path


async def test_open_and_click_tracking(client, anon_client, outbox):
    _, campaign, path = await _sent_campaign(client, outbox)

    for _ in range(2):
        pixel = await anon_client.get(path("o"))
        assert pixel.status_code == 200 and pixel.headers["content-type"] == "image/gif"

    detail = (await client.get(f"/api/v1/campaigns/{campaign['id']}")).json()["data"]
    assert detail["openedCount"] == 1  # unique opens
    assert detail["open"] == 100.0

    click = await anon_client.get(path("c"), follow_redirects=False)
    assert click.status_code == 302
    assert click.headers["location"] == "https://shop.example.com/sale"
    detail = (await client.get(f"/api/v1/campaigns/{campaign['id']}")).json()["data"]
    assert detail["clickedCount"] == 1 and detail["click"] == 100.0


async def test_click_on_unopened_email_counts_an_open(client, anon_client, outbox):
    _, campaign, path = await _sent_campaign(client, outbox)
    await anon_client.get(path("c"), follow_redirects=False)
    detail = (await client.get(f"/api/v1/campaigns/{campaign['id']}")).json()["data"]
    assert detail["openedCount"] == 1 and detail["clickedCount"] == 1


async def test_tampered_tokens_are_rejected(anon_client):
    assert (await anon_client.get("/api/v1/t/c/forged.token")).status_code == 404
    pixel = await anon_client.get("/api/v1/t/o/forged.token.gif")
    assert pixel.status_code == 200  # pixel always renders, but nothing is recorded
    assert (await anon_client.get("/api/v1/t/u/forged")).status_code == 400


async def test_unsubscribe_requires_post(client, anon_client, outbox):
    contact, campaign, path = await _sent_campaign(client, outbox)
    unsub = path("u")

    page = await anon_client.get(unsub)
    assert page.status_code == 200 and "Unsubscribe" in page.text
    still = (await client.get(f"/api/v1/contacts/{contact['id']}")).json()["data"]
    assert still["status"] == "Subscribed"  # link scanners must not unsubscribe people

    assert (await anon_client.post(unsub)).json() == {"success": True}
    after = (await client.get(f"/api/v1/contacts/{contact['id']}")).json()["data"]
    assert after["status"] == "Unsubscribed"
    detail = (await client.get(f"/api/v1/campaigns/{campaign['id']}")).json()["data"]
    assert detail["unsubscribedCount"] == 1


async def test_bounce_webhook(client, anon_client, outbox, session):
    contact, campaign, _ = await _sent_campaign(client, outbox)
    message = await session.scalar(select(EmailMessage))
    body = json.dumps(
        {"messageId": message.provider_message_id, "event": "bounced", "bounceType": "hard"}
    ).encode()

    unsigned = await anon_client.post("/api/v1/webhooks/email", content=body)
    assert unsigned.status_code == 401

    sig = hmac.new(b"whsec-test", body, hashlib.sha256).hexdigest()
    resp = await anon_client.post(
        "/api/v1/webhooks/email", content=body, headers={"X-Zozo-Signature": f"sha256={sig}"}
    )
    assert resp.status_code == 200

    detail = (await client.get(f"/api/v1/campaigns/{campaign['id']}")).json()["data"]
    assert detail["bouncedCount"] == 1 and detail["deliveredCount"] == 0
    bounced = (await client.get(f"/api/v1/contacts/{contact['id']}")).json()["data"]
    assert bounced["status"] == "Unsubscribed"  # hard bounces stop future sends
