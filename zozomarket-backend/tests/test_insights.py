"""Dashboard, analytics, and calendar."""

import datetime as dt

from app.services.seed import seed_demo_data


async def test_seed_is_disabled(session):
    assert await seed_demo_data(session) is False
    assert await seed_demo_data(session) is False


async def test_dashboard_uses_mailtrap_delivery_counts(client, monkeypatch):
    day = dt.date.today()

    async def fake_daily(start, end):
        if start <= day <= end:
            return {
                day: {
                    "sent": 2,
                    "delivered": 2,
                    "opens": 1,
                    "clicks": 1,
                    "bounces": 0,
                    "unsubscribes": 0,
                }
            }
        return {}

    async def this_account(_session):
        return True

    monkeypatch.setattr("app.services.mailtrap_stats.daily_counts", fake_daily)
    monkeypatch.setattr("app.services.analytics_service._owns_shared_mailbox", this_account)
    data = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert data["emailsDelivered"]["raw"] == 2
    assert data["emailOpenRate"]["value"] == "50.0%"
    assert data["avgClickRate"]["value"] == "50.0%"

    series = (await client.get("/api/v1/analytics/performance?interval=week")).json()["data"]
    assert sum(point["delivered"] for point in series) == 2


async def test_other_accounts_keep_their_own_mail_counts(client, monkeypatch):
    async def fake_daily(start, end):
        return {
            dt.date.today(): {
                "sent": 9,
                "delivered": 9,
                "opens": 8,
                "clicks": 0,
                "bounces": 0,
                "unsubscribes": 0,
            }
        }

    monkeypatch.setattr("app.services.mailtrap_stats.daily_counts", fake_daily)
    data = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert data["emailsDelivered"]["raw"] == 0
    assert data["emailOpenRate"]["value"] == "0.0%"


async def test_dashboard_shape_matches_frontend(client):
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
    }
    for kpi in data["kpis"].values():
        assert isinstance(kpi["value"], str) and isinstance(kpi["trend"], int | float)
    assert data["kpis"]["totalSubscribers"]["value"] == "0"
    assert data["recentCampaigns"] == []


async def test_performance_series_and_overview(client):
    resp = await client.get(
        "/api/v1/analytics/performance", params={"start": "2026-08-31", "end": "2026-10-11"}
    )
    points = resp.json()["data"]
    assert [p["week"] for p in points] == ["Aug 31", "Sep 7", "Sep 14", "Sep 21", "Sep 28", "Oct 5"]
    assert [p["delivered"] for p in points] == [0, 0, 0, 0, 0, 0]
    assert points[-1]["clicks"] == 0

    monthly = await client.get(
        "/api/v1/analytics/performance",
        params={"start": "2026-09-01", "end": "2026-10-31", "interval": "month"},
    )
    assert [p["week"] for p in monthly.json()["data"]] == ["Sep 2026", "Oct 2026"]

    overview = await client.get(
        "/api/v1/analytics/overview", params={"start": "2026-08-31", "end": "2026-10-11"}
    )
    o = overview.json()["data"]
    assert o["delivered"] == 0 and o["deliveryRate"] is None

    bad = await client.get(
        "/api/v1/analytics/overview", params={"start": "2026-10-11", "end": "2026-01-01"}
    )
    assert bad.status_code == 400

    campaigns = (await client.get("/api/v1/analytics/campaigns")).json()["data"]
    assert campaigns == []

    deliverability = (await client.get("/api/v1/analytics/deliverability")).json()["data"]
    assert deliverability["unsubscribedContacts"] == 0


async def test_calendar_range_and_summary(client):
    resp = await client.get("/api/v1/calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
    events = resp.json()["data"]
    assert events == []

    only_promos = await client.get(
        "/api/v1/calendar",
        params={"start": "2026-10-01", "end": "2026-10-31", "type": "Promotional"},
    )
    assert only_promos.json()["data"] == []

    summary = await client.get(
        "/api/v1/calendar/summary", params={"start": "2026-10-01", "end": "2026-10-31"}
    )
    assert sum(d["total"] for d in summary.json()["data"]) == len(events)

    too_wide = await client.get(
        "/api/v1/calendar", params={"start": "2026-01-01", "end": "2028-01-01"}
    )
    assert too_wide.status_code == 400
