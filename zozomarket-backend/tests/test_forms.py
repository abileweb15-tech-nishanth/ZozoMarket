import re

BASE = "/api/v1/forms"


async def _live_form(client, **extra):
    body = {
        "name": "Newsletter Signup",
        "title": "Join us",
        "tags": ["Newsletter"],
        "fields": [{"name": "company", "label": "Company", "required": True}],
        **extra,
    }
    form = (await client.post(BASE, json=body)).json()["data"]
    assert form["status"] == "Draft" and form["slug"] == "newsletter-signup"
    resp = await client.patch(f"{BASE}/{form['id']}", json={"status": "Live"})
    return resp.json()["data"]


async def test_public_submission_creates_contact(client, anon_client):
    form = await _live_form(client)
    slug = form["slug"]

    config = await anon_client.get(f"/api/v1/public/forms/{slug}")
    assert config.status_code == 200 and config.json()["data"]["title"] == "Join us"
    await anon_client.post(f"/api/v1/public/forms/{slug}/view")

    missing = await anon_client.post(
        f"/api/v1/public/forms/{slug}/submit", json={"email": "lead@example.com"}
    )
    assert missing.status_code == 400 and missing.json()["details"] == ["Company"]

    ok = await anon_client.post(
        f"/api/v1/public/forms/{slug}/submit",
        json={
            "email": "Lead@Example.com",
            "name": "Lea",
            "fields": {"company": "Acme", "evil": "x"},
        },
    )
    assert ok.status_code == 200
    assert ok.json()["data"]["requiresConfirmation"] is False

    contacts = (await client.get("/api/v1/contacts")).json()["data"]
    assert len(contacts) == 1
    lead = contacts[0]
    assert lead["email"] == "lead@example.com" and lead["tags"] == ["Newsletter"]
    assert lead["attributes"] == {"company": "Acme"}  # unknown fields dropped
    assert lead["source"] == "Signup Form"

    stats = (await client.get(f"{BASE}/{form['id']}")).json()["data"]
    assert stats["views"] == 1 and stats["subs"] == 1 and stats["conversionRate"] == 100.0


async def test_honeypot_and_consent(client, anon_client):
    form = await _live_form(client, fields=[])
    url = f"/api/v1/public/forms/{form['slug']}/submit"
    bot = await anon_client.post(url, json={"email": "bot@example.com", "website": "spam.biz"})
    assert bot.status_code == 200
    no_consent = await anon_client.post(url, json={"email": "x@example.com", "consent": False})
    assert no_consent.status_code == 400
    assert (await client.get("/api/v1/contacts")).json()["total"] == 0


async def test_double_opt_in_flow(client, anon_client, outbox):
    form = await _live_form(client, fields=[], double_opt_in=True)
    resp = await anon_client.post(
        f"/api/v1/public/forms/{form['slug']}/submit", json={"email": "d@example.com"}
    )
    assert resp.json()["data"]["requiresConfirmation"] is True
    contact = (await client.get("/api/v1/contacts")).json()["data"][0]
    assert contact["status"] == "Pending"

    link = re.search(
        r'href="http://testserver(/api/v1/public/confirm/[^"]+)"', outbox.outbox[-1].html
    ).group(1)
    confirm = await anon_client.get(link)
    assert confirm.status_code == 200
    contact = (await client.get(f"/api/v1/contacts/{contact['id']}")).json()["data"]
    assert contact["status"] == "Subscribed"

    bad = await anon_client.get("/api/v1/public/confirm/invalid")
    assert bad.status_code == 400


async def test_draft_forms_are_not_public(client, anon_client):
    form = (await client.post(BASE, json={"name": "Hidden"})).json()["data"]
    assert (await anon_client.get(f"/api/v1/public/forms/{form['slug']}")).status_code == 404
    page = await anon_client.get(f"/api/v1/public/pages/{form['slug']}")
    assert page.status_code == 404


async def test_landing_page_and_slug_uniqueness(client, anon_client):
    form = await _live_form(client, kind="Landing Pages", fields=[])
    page = await anon_client.get(f"/api/v1/public/pages/{form['slug']}")
    assert page.status_code == 200 and "<form" in page.text and "Join us" in page.text

    second = (await client.post(BASE, json={"name": "Newsletter Signup"})).json()["data"]
    assert second["slug"] != form["slug"]
    clash = await client.post(BASE, json={"name": "x", "slug": form["slug"]})
    assert clash.status_code == 409

    listed = (await client.get(BASE, params={"kind": "Landing Pages"})).json()
    assert listed["total"] == 1
