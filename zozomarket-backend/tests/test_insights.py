"""Dashboard, analytics, and calendar."""

import datetime as dt

from app.core.config import settings
from app.services.seed import seed_demo_data


async def test_seed_is_disabled(session):
    assert await seed_demo_data(session) is False
    assert await seed_demo_data(session) is False


async def test_dashboard_uses_local_delivery_counts(client):
    data = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert data["emailsDelivered"]["raw"] == 0
    assert data["emailOpenRate"]["value"] == "0.0%"
    assert data["avgClickRate"]["value"] == "0.0%"


async def test_dashboard_uses_ses_delivery_counts(client, monkeypatch):
    day = dt.date.today()

    async def fake_daily(start, end):
        if start <= day <= end:
            return {
                day: {
                    "sent": 4,
                    "delivered": 3,
                    "opens": 2,
                    "clicks": 1,
                    "bounces": 1,
                    "unsubscribes": 0,
                }
            }
        return {}

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "ses")
    monkeypatch.setattr("app.services.ses_stats.daily_counts", fake_daily)
    data = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert data["emailsDelivered"]["raw"] == 3
    assert data["deliveryRate"]["value"] == "75.0%"
    assert data["deliveryRate"]["detail"] == "3 of 4 sent"
    assert data["emailOpenRate"]["value"] == "66.7%"
    assert data["emailOpenRate"]["detail"] == "2 opened"
    assert data["avgClickRate"]["value"] == "33.3%"
    assert data["avgClickRate"]["detail"] == "1 clicked"
    assert data["totalSubscribers"]["raw"] == 0

    async def repeat_opens(start, end):
        if start <= day <= end:
            return {
                day: {
                    "sent": 4,
                    "delivered": 4,
                    "opens": 7,
                    "clicks": 6,
                    "bounces": 0,
                    "unsubscribes": 0,
                }
            }
        return {}

    monkeypatch.setattr("app.services.ses_stats.daily_counts", repeat_opens)
    again = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert again["emailsDelivered"]["raw"] == 4
    assert again["deliveryRate"]["detail"] == "4 of 4 sent"
    assert again["emailOpenRate"]["value"] == "100.0%"
    assert again["emailOpenRate"]["detail"] == "4 opened"
    assert again["avgClickRate"]["value"] == "100.0%"
    assert again["avgClickRate"]["detail"] == "4 clicked"
    series = (
        await client.get(
            "/api/v1/analytics/performance",
            params={"start": day.isoformat(), "end": day.isoformat(), "interval": "day"},
        )
    ).json()["data"]
    assert sum(point["opens"] for point in series) == 4
    assert sum(point["delivered"] for point in series) == 4


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


async def test_dashboard_prefers_local_stats_when_ses_daily_is_empty(client, session, monkeypatch):
    from sqlalchemy import select
    from app.models.account import Workspace
    from app.services.analytics_service import bump_stats

    ws = (await session.execute(select(Workspace))).scalar_one()
    await bump_stats(session, None, workspace_id=ws.id, sent=5, delivered=5, opens=3, clicks=1)
    await session.commit()

    async def empty_remote(start, end):
        return {}

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "ses")
    monkeypatch.setattr("app.services.ses_stats.daily_counts", empty_remote)

    data = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert data["emailsDelivered"]["raw"] == 5
    assert data["emailOpenRate"]["value"] == "60.0%"
    assert data["avgClickRate"]["value"] == "20.0%"


async def test_analytics_scopes_to_active_aws_region(client, session, monkeypatch):
    from sqlalchemy import select
    from app.models.account import Workspace
    from app.models.message import EmailStatDaily
    from app.services.aws_credentials import AwsCredentials

    ws = (await session.execute(select(Workspace))).scalar_one()
    today = dt.date.today()
    session.add(
        EmailStatDaily(
            workspace_id=ws.id,
            day=today,
            campaign_id="old-camp",
            aws_region="us-east-2",
            sent=20,
            delivered=20,
            opens=10,
            clicks=5,
        )
    )
    await session.commit()

    creds = AwsCredentials(
        access_key_id="AKIA_TEST",
        secret_access_key="SECRET_TEST",
        region="ap-southeast-2",
        configuration_set="zozomarket-tracking",
        sqs_queue_url=None,
        s3_bucket_name=None,
        s3_media_enabled=False,
    )
    monkeypatch.setattr("app.services.aws_credentials.get_aws_credentials", lambda: creds)

    async def empty_remote(start, end):
        return {}

    monkeypatch.setattr("app.services.ses_stats.daily_counts", empty_remote)

    data = (await client.get("/api/v1/dashboard/kpis")).json()["data"]
    assert data["emailsDelivered"]["raw"] == 0


def test_ses_stats_fetch_sums_campaign_dimensions_without_account_wide(monkeypatch):
    from app.services import ses_stats
    from app.services.aws_credentials import AwsCredentials

    creds = AwsCredentials(
        access_key_id="AKIA_TEST",
        secret_access_key="SECRET_TEST",
        region="ap-southeast-2",
        configuration_set="zozomarket-tracking",
        sqs_queue_url=None,
        s3_bucket_name=None,
        s3_media_enabled=False,
    )
    monkeypatch.setattr(ses_stats, "get_aws_credentials", lambda: creds)

    seen_dimensions = []

    class FakePaginator:
        def paginate(self, **kwargs):
            return [
                {
                    "Metrics": [
                        {"MetricName": "Send", "Dimensions": [{"Name": "campaign", "Value": "newsletter"}]},
                        {"MetricName": "Send", "Dimensions": [{"Name": "campaign", "Value": "welcome"}]},
                    ]
                }
            ]

    class FakeCW:
        def get_paginator(self, name):
            return FakePaginator()

        def get_metric_statistics(self, *, MetricName, Dimensions, StartTime, EndTime, **kwargs):
            seen_dimensions.append(Dimensions)
            if not Dimensions:
                raise AssertionError("Must not query unfiltered account-wide Dimensions=[]")
            if Dimensions == [{"Name": "campaign", "Value": "newsletter"}] and MetricName == "Send":
                return {"Datapoints": [{"Timestamp": StartTime, "Sum": 2.0}]}
            if Dimensions == [{"Name": "campaign", "Value": "welcome"}] and MetricName == "Send":
                return {"Datapoints": [{"Timestamp": StartTime, "Sum": 3.0}]}
            return {"Datapoints": []}

    monkeypatch.setattr(ses_stats.boto3, "client", lambda *a, **kw: FakeCW())
    today = dt.date.today()
    days = ses_stats._fetch(today, today)
    assert days == {today: {"sent": 5, "delivered": 0, "opens": 0, "clicks": 0, "bounces": 0, "unsubscribes": 0}}
    assert [] not in seen_dimensions
