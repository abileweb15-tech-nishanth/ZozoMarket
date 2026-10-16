import datetime as dt
from collections import defaultdict

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.core.exceptions import AppError
from app.models.base import utcnow
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.schemas.calendar import CalendarDaySummary, CalendarEvent
from app.schemas.common import ApiResponse
from app.services import campaign_service

router = APIRouter(prefix="/calendar", tags=["Calendar"])

MAX_RANGE_DAYS = 366


def to_event(c: Campaign) -> CalendarEvent:
    at = c.effective_at
    return CalendarEvent(
        id=c.id,
        title=c.name,
        date=at.date(),
        time=at.strftime("%H:%M"),
        type=c.type,
        status=c.status,
        campaign_id=c.id,
        starts_at=at,
        recipients=c.recipients,
    )


def _range(start: dt.date | None, end: dt.date | None) -> tuple[dt.date, dt.date]:
    today = utcnow().date()
    start = start or today.replace(day=1)
    end = end or (start + dt.timedelta(days=41))
    if end < start:
        raise AppError("end must be on or after start", code="invalid_range")
    if (end - start).days > MAX_RANGE_DAYS:
        raise AppError(f"Range cannot exceed {MAX_RANGE_DAYS} days", code="invalid_range")
    return start, end


@router.get("", response_model=ApiResponse[list[CalendarEvent]])
async def list_events(
    db: DbSession,
    start: dt.date | None = Query(default=None, description="Defaults to first of this month"),
    end: dt.date | None = Query(default=None, description="Defaults to start + 6 weeks"),
    type_: CampaignType | None = Query(default=None, alias="type"),
    status_: CampaignStatus | None = Query(default=None, alias="status"),
):
    start, end = _range(start, end)
    campaigns = await campaign_service.calendar_campaigns(
        db, start=start, end=end, type_=type_, status=status_
    )
    return ApiResponse(data=[to_event(c) for c in campaigns])


@router.get("/upcoming", response_model=ApiResponse[list[CalendarEvent]])
async def upcoming_events(db: DbSession, limit: int = Query(default=10, ge=1, le=100)):
    return ApiResponse(data=[to_event(c) for c in await campaign_service.upcoming(db, limit=limit)])


@router.get("/summary", response_model=ApiResponse[list[CalendarDaySummary]])
async def daily_summary(
    db: DbSession,
    start: dt.date | None = None,
    end: dt.date | None = None,
):
    """Per-day dispatch counts for heat-map / month views."""
    start, end = _range(start, end)
    days: dict[dt.date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for c in await campaign_service.calendar_campaigns(db, start=start, end=end):
        days[c.effective_at.date()][c.status.value] += 1
    return ApiResponse(
        data=[
            CalendarDaySummary(date=d, total=sum(s.values()), by_status=dict(s))
            for d, s in sorted(days.items())
        ]
    )
