from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.api.v1.endpoints.calendar import to_event
from app.models.campaign import Campaign
from app.schemas.campaign import CampaignRead
from app.schemas.common import ApiResponse
from app.schemas.dashboard import DashboardData, DashboardKPIs
from app.services import analytics_service, campaign_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=ApiResponse[DashboardData])
async def dashboard(db: DbSession, _user: CurrentUser):
    """KPIs (30-day window vs the previous 30 days), recent campaigns and upcoming sends."""
    kpis = await analytics_service.dashboard_kpis(db)
    recent = await db.scalars(select(Campaign).order_by(Campaign.updated_at.desc()).limit(5))
    upcoming = await campaign_service.upcoming(db, limit=5)
    return ApiResponse(
        data=DashboardData(
            kpis=DashboardKPIs(**kpis),
            recent_campaigns=[CampaignRead.from_model(c) for c in recent],
            upcoming_events=[to_event(c) for c in upcoming],
        )
    )


@router.get("/kpis", response_model=ApiResponse[DashboardKPIs])
async def kpis(db: DbSession, _user: CurrentUser):
    return ApiResponse(data=DashboardKPIs(**await analytics_service.dashboard_kpis(db)))
