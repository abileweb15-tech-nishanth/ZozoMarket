import datetime as dt
from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.core.exceptions import AppError
from app.models.base import utcnow
from app.schemas.analytics import (
    AnalyticsOverview,
    CampaignPerformance,
    Deliverability,
    PerformancePoint,
)
from app.schemas.common import ApiResponse
from app.services import analytics_service, campaign_service

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _range(start: dt.date | None, end: dt.date | None, default_days: int = 90):
    end = end or utcnow().date()
    start = start or end - dt.timedelta(days=default_days - 1)
    if start > end:
        raise AppError("start must be on or before end", code="invalid_range")
    if (end - start).days > 731:
        raise AppError("Range cannot exceed two years", code="invalid_range")
    return start, end


@router.get("/overview", response_model=ApiResponse[AnalyticsOverview])
async def overview(db: DbSession, start: dt.date | None = None, end: dt.date | None = None):
    start, end = _range(start, end, 30)
    return ApiResponse(data=AnalyticsOverview(**await analytics_service.overview(db, start, end)))


@router.get("/performance", response_model=ApiResponse[list[PerformancePoint]])
async def performance(
    db: DbSession,
    start: dt.date | None = None,
    end: dt.date | None = None,
    interval: Literal["day", "week", "month"] = "week",
    campaign_id: str | None = Query(default=None, alias="campaignId"),
):
    """Delivered / opens / clicks time series (the dashboard & analytics charts)."""
    start, end = _range(start, end)
    if interval == "day" and (end - start).days > 186:
        raise AppError("Daily interval supports at most 186 days", code="invalid_range")
    points = await analytics_service.performance_series(db, start, end, interval, campaign_id)
    return ApiResponse(data=[PerformancePoint(**p) for p in points])


@router.get("/campaigns", response_model=ApiResponse[list[CampaignPerformance]])
async def campaign_performance(db: DbSession, limit: int = Query(default=50, ge=1, le=500)):
    campaigns = await analytics_service.campaign_performance(db, limit)
    return ApiResponse(
        data=[
            CampaignPerformance(
                id=c.id,
                name=c.name,
                type=c.type.value,
                status=c.status.value,
                date=c.effective_at.date(),
                recipients=c.recipients,
                sent=c.sent_count,
                delivered=c.delivered_count,
                opens=c.opened_count,
                clicks=c.clicked_count,
                bounces=c.bounced_count,
                delivery=c.delivery_rate,
                open=c.open_rate,
                click=c.click_rate,
            )
            for c in campaigns
        ]
    )


@router.get("/campaigns/{campaign_id}", response_model=ApiResponse[list[PerformancePoint]])
async def single_campaign_series(
    db: DbSession, campaign_id: str, interval: Literal["day", "week"] = "day"
):
    campaign = await campaign_service.get_campaign(db, campaign_id)
    start = (campaign.started_at or campaign.created_at).date()
    end = min(start + dt.timedelta(days=30), utcnow().date())
    points = await analytics_service.performance_series(
        db, start, max(start, end), interval, campaign_id
    )
    return ApiResponse(data=[PerformancePoint(**p) for p in points])


@router.get("/deliverability", response_model=ApiResponse[Deliverability])
async def deliverability(db: DbSession, start: dt.date | None = None, end: dt.date | None = None):
    start, end = _range(start, end, 30)
    return ApiResponse(
        data=Deliverability(**await analytics_service.deliverability(db, start, end))
    )
