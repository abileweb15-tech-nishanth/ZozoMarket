from fastapi import APIRouter, BackgroundTasks, Query, status

from app.api.deps import DbSession, PageParams
from app.models.campaign import CampaignStatus, CampaignType
from app.schemas.campaign import (
    CampaignCreate,
    CampaignDetail,
    CampaignRead,
    CampaignUpdate,
    RecipientEstimate,
    ScheduleRequest,
    TestSendRequest,
)
from app.schemas.common import AffectedCount, ApiResponse, ListResponse, SuccessResponse
from app.services import campaign_service, contact_service
from app.workers.jobs import enqueue_campaign_dispatch

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


@router.get("", response_model=ListResponse[CampaignRead])
async def list_campaigns(
    db: DbSession,
    page: PageParams,
    q: str | None = Query(default=None, max_length=200),
    status_: CampaignStatus | None = Query(default=None, alias="status"),
    type_: CampaignType | None = Query(default=None, alias="type"),
):
    items, total = await campaign_service.list_campaigns(
        db, q=q, status=status_, type_=type_, offset=page.offset, limit=page.limit
    )
    return page.response([CampaignRead.from_model(c) for c in items], total)


@router.get("/stats", response_model=ApiResponse[dict[str, int]])
async def campaign_status_counts(db: DbSession):
    return ApiResponse(data=await campaign_service.status_counts(db))


@router.get("/estimate", response_model=ApiResponse[RecipientEstimate])
async def estimate_recipients(db: DbSession, tags: list[str] = Query(default_factory=list)):
    """Number of subscribed contacts matching any of `tags` (all subscribers if none)."""
    count = await contact_service.count_segment(db, tags)
    return ApiResponse(data=RecipientEstimate(recipients=count, audience_tags=tags))


@router.post("", response_model=ApiResponse[CampaignDetail], status_code=status.HTTP_201_CREATED)
async def create_campaign(db: DbSession, body: CampaignCreate):
    campaign = await campaign_service.create_campaign(db, body)
    return ApiResponse(data=CampaignDetail.from_model(campaign))


@router.get("/{campaign_id}", response_model=ApiResponse[CampaignDetail])
async def get_campaign(db: DbSession, campaign_id: str):
    return ApiResponse(
        data=CampaignDetail.from_model(await campaign_service.get_campaign(db, campaign_id))
    )


@router.patch("/{campaign_id}", response_model=ApiResponse[CampaignDetail])
async def update_campaign(db: DbSession, campaign_id: str, body: CampaignUpdate):
    campaign = await campaign_service.update_campaign(db, campaign_id, body)
    return ApiResponse(data=CampaignDetail.from_model(campaign))


@router.delete("/{campaign_id}", response_model=SuccessResponse)
async def delete_campaign(db: DbSession, campaign_id: str):
    await campaign_service.delete_campaign(db, campaign_id)
    return SuccessResponse()


@router.post(
    "/{campaign_id}/duplicate",
    response_model=ApiResponse[CampaignDetail],
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_campaign(db: DbSession, campaign_id: str):
    campaign = await campaign_service.duplicate_campaign(db, campaign_id)
    return ApiResponse(data=CampaignDetail.from_model(campaign))


@router.post("/{campaign_id}/schedule", response_model=ApiResponse[CampaignRead])
async def schedule_campaign(db: DbSession, campaign_id: str, body: ScheduleRequest):
    campaign = await campaign_service.schedule(db, campaign_id, body.scheduled_at)
    return ApiResponse(data=CampaignRead.from_model(campaign))


@router.post("/{campaign_id}/unschedule", response_model=ApiResponse[CampaignRead])
async def unschedule_campaign(db: DbSession, campaign_id: str):
    campaign = await campaign_service.unschedule(db, campaign_id)
    return ApiResponse(data=CampaignRead.from_model(campaign))


@router.post(
    "/{campaign_id}/send",
    response_model=ApiResponse[CampaignRead],
    status_code=status.HTTP_202_ACCEPTED,
)
async def send_campaign(db: DbSession, campaign_id: str, background_tasks: BackgroundTasks):
    """Send now (also used to retry a Failed campaign — already-delivered recipients are
    skipped). Returns 202 immediately; poll the campaign for progress."""
    campaign = await campaign_service.start_send(db, campaign_id)
    enqueue_campaign_dispatch(campaign.id, background_tasks)
    return ApiResponse(data=CampaignRead.from_model(campaign))


@router.post("/{campaign_id}/test", response_model=ApiResponse[AffectedCount])
async def send_test_email(db: DbSession, campaign_id: str, body: TestSendRequest):
    sent = await campaign_service.send_test(db, campaign_id, [str(e) for e in body.emails])
    return ApiResponse(data=AffectedCount(affected=sent))
