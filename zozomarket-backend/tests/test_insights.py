"""Dashboard, analytics, calendar and AI copywriter."""

import httpx

from app.services import ai_service
from app.services.seed import seed_demo_data


async def test_seed_is_idempotent(session):
    assert await seed_demo_data(session) is True
    assert await seed_demo_data(session) is False


async def test_dashboard_shape_matches_frontend(client, session):
    await seed_demo_data(session)
    resp = await client.get("/api/v1/dashboard")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert set(data["kpis"]) == {
        "emailsDelivered",
        "deliveryRate",
        "emailOpenRate",
        "avgClickRate",
        "totalSubscribers",
        "scheduledCampaigns",
        "activeAutomations",
    }
    for kpi in data["kpis"].values():
        assert isinstance(kpi["value"], str) and isinstance(kpi["trend"], int | float)
    assert data["kpis"]["totalSubscribers"]["value"] == "5"
    assert data["kpis"]["activeAutomations"]["value"] == "2"
    assert len(data["recentCampaigns"]) == 5
    first = data["recentCampaigns"][0]
    assert {
        "id",
        "name",
        "audience",
        "type",
        "status",
        "date",
        "recipients",
        "delivery",
        "open",
        "click",
    } <= set(first)


async def test_performance_series_and_overview(client, session):
    await seed_demo_data(session)
    resp = await client.get(
        "/api/v1/analytics/performance", params={"start": "2026-08-31", "end": "2026-10-11"}
    )
    points = resp.json()["data"]
    assert [p["week"] for p in points] == ["Aug 31", "Sep 7", "Sep 14", "Sep 21", "Sep 28", "Oct 5"]
    assert [p["delivered"] for p in points] == [12400, 14100, 13200, 16800, 18200, 19600]
    assert points[-1]["clicks"] == 1320

    monthly = await client.get(
        "/api/v1/analytics/performance",
        params={"start": "2026-09-01", "end": "2026-10-31", "interval": "month"},
    )
    assert [p["week"] for p in monthly.json()["data"]] == ["Sep 2026", "Oct 2026"]

    overview = await client.get(
        "/api/v1/analytics/overview", params={"start": "2026-08-31", "end": "2026-10-11"}
    )
    o = overview.json()["data"]
    assert o["delivered"] == 94300 and 98 < o["deliveryRate"] < 99.5

    bad = await client.get(
        "/api/v1/analytics/overview", params={"start": "2026-10-11", "end": "2026-01-01"}
    )
    assert bad.status_code == 400

    campaigns = (await client.get("/api/v1/analytics/campaigns")).json()["data"]
    spring = next(c for c in campaigns if c["id"] == "c1")
    assert spring["delivery"] == 98.6 and spring["open"] == 41.2 and spring["click"] == 6.8

    deliverability = (await client.get("/api/v1/analytics/deliverability")).json()["data"]
    assert deliverability["unsubscribedContacts"] == 1


async def test_calendar_range_and_summary(client, session):
    await seed_demo_data(session)
    resp = await client.get("/api/v1/calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
    events = resp.json()["data"]
    ids = [e["id"] for e in events]
    assert ids[:3] == ["c1", "p3", "p2"]
    assert "c4" not in ids  # November
    halloween = next(e for e in events if e["id"] == "e2")
    assert halloween["date"] == "2026-10-29" and halloween["time"] == "08:00"

    only_promos = await client.get(
        "/api/v1/calendar",
        params={"start": "2026-10-01", "end": "2026-10-31", "type": "Promotional"},
    )
    assert {e["type"] for e in only_promos.json()["data"]} == {"Promotional"}

    summary = await client.get(
        "/api/v1/calendar/summary", params={"start": "2026-10-01", "end": "2026-10-31"}
    )
    assert sum(d["total"] for d in summary.json()["data"]) == len(events)

    too_wide = await client.get(
        "/api/v1/calendar", params={"start": "2026-01-01", "end": "2028-01-01"}
    )
    assert too_wide.status_code == 400


async def test_ai_generate_mock(client):
    resp = await client.post(
        "/api/v1/ai/generate",
        json={
            "format": "Promotional",
            "goal": "Drive autumn sales",
            "product": "Maple Roast",
            "audience": "VIPs",
            "tone": "Urgent",
        },
    )
    data = resp.json()["data"]
    assert data["provider"] == "mock"
    assert [s["label"] for s in data["sections"]] == ai_service.FORMAT_SECTIONS["Promotional"]
    assert "Maple Roast" in data["sections"][0]["value"]

    subjects = await client.post(
        "/api/v1/ai/subject-lines", json={"goal": "Launch", "product": "Cold Brew", "count": 3}
    )
    assert len(subjects.json()["data"]["suggestions"]) == 3

    pre = await client.post("/api/v1/ai/preheaders", json={"goal": "Launch", "count": 2})
    assert len(pre.json()["data"]["suggestions"]) == 2

    invalid = await client.post("/api/v1/ai/generate", json={"goal": "x", "format": "Haiku"})
    assert invalid.status_code == 422


async def test_ai_provider_failure_falls_back_to_mock(client, monkeypatch):
    class Failing:
        provider, model = "openai", "gpt-test"

        async def complete_json(self, system, user):
            raise httpx.ConnectError("boom")

    monkeypatch.setattr(ai_service, "_client", lambda: Failing())
    resp = await client.post("/api/v1/ai/subject-lines", json={"goal": "Launch"})
    assert resp.json()["data"]["provider"] == "mock"

    monkeypatch.setattr(ai_service.settings, "AI_FALLBACK_TO_MOCK", False)
    resp = await client.post("/api/v1/ai/subject-lines", json={"goal": "Launch"})
    assert resp.status_code == 502 and resp.json()["code"] == "ai_unavailable"


async def test_ai_uses_provider_output(client, monkeypatch):
    class Fake:
        provider, model = "anthropic", "claude-test"

        async def complete_json(self, system, user):
            assert "Cold Brew" in user
            return {"suggestions": ["One", " ", "Two"]}

    monkeypatch.setattr(ai_service, "_client", lambda: Fake())
    resp = await client.post(
        "/api/v1/ai/subject-lines", json={"goal": "Launch", "product": "Cold Brew", "count": 5}
    )
    data = resp.json()["data"]
    assert data == {"suggestions": ["One", "Two"], "provider": "anthropic", "model": "claude-test"}


def test_extract_json_handles_fenced_output():
    assert ai_service._extract_json('Sure!\n```json\n{"a": 1}\n```') == {"a": 1}
