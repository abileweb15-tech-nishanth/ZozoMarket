from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, PageParams
from app.models.automation import AutomationStatus
from app.models.contact import Contact
from app.schemas.automation import (
    AutomationCreate,
    AutomationRead,
    AutomationUpdate,
    EnrollmentResult,
    EnrollRequest,
    TriggerEventRequest,
)
from app.schemas.common import ApiResponse, ListResponse, SuccessResponse
from app.services import automation_service, contact_service

router = APIRouter(prefix="/automations", tags=["Automations"])


@router.get("", response_model=ListResponse[AutomationRead])
async def list_automations(
    db: DbSession,
    page: PageParams,
    q: str | None = Query(default=None, max_length=200),
    status_: AutomationStatus | None = Query(default=None, alias="status"),
):
    items, total = await automation_service.list_automations(
        db, q=q, status=status_, offset=page.offset, limit=page.limit
    )
    return page.response([AutomationRead.from_model(a) for a in items], total)


@router.post("", response_model=ApiResponse[AutomationRead], status_code=status.HTTP_201_CREATED)
async def create_automation(db: DbSession, body: AutomationCreate):
    automation = await automation_service.create_automation(db, body)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post("/events", response_model=ApiResponse[EnrollmentResult])
async def trigger_event(db: DbSession, body: TriggerEventRequest):
    """Ingest an external event (order completed, cart abandoned, …) for a contact by email.
    Unknown emails are created as subscribed contacts with source "API"."""
    contact = await contact_service.get_by_email(db, body.email)
    if contact is None:
        contact = Contact(
            email=contact_service.normalize_email(body.email), name=body.name or "", source="API"
        )
        db.add(contact)
        await db.flush()
    enrolled = await automation_service.handle_event(db, body.event, contact, body.data)
    await db.commit()
    return ApiResponse(data=EnrollmentResult(enrolled=enrolled))


@router.get("/{automation_id}", response_model=ApiResponse[AutomationRead])
async def get_automation(db: DbSession, automation_id: str):
    automation = await automation_service.get_automation(db, automation_id)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.get("/{automation_id}/stats", response_model=ApiResponse[dict[str, int]])
async def automation_stats(db: DbSession, automation_id: str):
    await automation_service.get_automation(db, automation_id)
    return ApiResponse(data=await automation_service.enrollment_stats(db, automation_id))


@router.patch("/{automation_id}", response_model=ApiResponse[AutomationRead])
async def update_automation(db: DbSession, automation_id: str, body: AutomationUpdate):
    automation = await automation_service.update_automation(db, automation_id, body)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post("/{automation_id}/activate", response_model=ApiResponse[AutomationRead])
async def activate_automation(db: DbSession, automation_id: str):
    automation = await automation_service.set_status(db, automation_id, AutomationStatus.ACTIVE)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post("/{automation_id}/pause", response_model=ApiResponse[AutomationRead])
async def pause_automation(db: DbSession, automation_id: str):
    automation = await automation_service.set_status(db, automation_id, AutomationStatus.PAUSED)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post("/{automation_id}/enroll", response_model=ApiResponse[EnrollmentResult])
async def enroll_contacts(db: DbSession, automation_id: str, body: EnrollRequest):
    """Manually enroll contacts (only subscribed contacts not already enrolled are added)."""
    automation = await automation_service.get_automation(db, automation_id)
    enrolled = await automation_service.enroll(db, automation, body.contact_ids)
    await db.commit()
    return ApiResponse(data=EnrollmentResult(enrolled=enrolled))


@router.delete("/{automation_id}", response_model=SuccessResponse)
async def delete_automation(db: DbSession, automation_id: str):
    await automation_service.delete_automation(db, automation_id)
    return SuccessResponse()
