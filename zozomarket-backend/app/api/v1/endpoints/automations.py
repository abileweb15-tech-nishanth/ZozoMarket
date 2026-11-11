from typing import Any

from fastapi import APIRouter, BackgroundTasks, Query, status
from sqlalchemy import select

from app.api.deps import DbSession, PageParams
from app.models.automation import AutomationStatus
from app.models.contact import Contact, SubscriptionStatus
from app.schemas.automation import (
    AutomationCreate,
    AutomationRead,
    AutomationUpdate,
    EnrollmentRead,
    EnrollmentResult,
    EnrollRequest,
    ExecutionFlowRead,
    SesSyncResult,
    StepRead,
    TestSendRequest,
    TriggerEventRequest,
    WorkflowProblem,
    WorkflowValidation,
)
from app.schemas.common import ApiResponse, ListResponse, SuccessResponse
from app.services import automation_service, contact_service
from app.workers import jobs

router = APIRouter(prefix="/automations", tags=["Automations"])


@router.get("", response_model=ListResponse[AutomationRead])
async def list_automations(
    db: DbSession,
    page: PageParams,
    q: str | None = Query(default=None, max_length=200),
    status_: AutomationStatus | None = Query(default=None, alias="status"),
    sort: str = Query(default="updated", pattern="^(name|created|updated|activity)$"),
):
    items, total = await automation_service.list_automations(
        db, q=q, status=status_, offset=page.offset, limit=page.limit, sort=sort
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
async def activate_automation(
    db: DbSession,
    automation_id: str,
    background_tasks: BackgroundTasks,
    enroll_existing: bool = Query(default=True),
):
    automation = await automation_service.set_status(db, automation_id, AutomationStatus.ACTIVE)
    if enroll_existing:
        contacts = list(
            await db.scalars(
                select(Contact.id).where(
                    Contact.workspace_id == automation.workspace_id,
                    Contact.status == SubscriptionStatus.SUBSCRIBED,
                )
            )
        )
        if contacts:
            await automation_service.enroll(db, automation, contacts)
            await db.commit()
            background_tasks.add_task(jobs.scheduler_tick)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post("/{automation_id}/enroll-subscribers", response_model=ApiResponse[EnrollmentResult])
async def enroll_subscribers(
    db: DbSession,
    automation_id: str,
    background_tasks: BackgroundTasks,
    restart: bool = Query(default=False),
):
    """Enroll all subscribed contacts in the workspace (resetting completed if restart=True)."""
    automation = await automation_service.get_automation(db, automation_id)
    contacts = list(
        await db.scalars(
            select(Contact.id).where(
                Contact.workspace_id == automation.workspace_id,
                Contact.status == SubscriptionStatus.SUBSCRIBED,
            )
        )
    )
    enrolled = 0
    if contacts:
        enrolled = await automation_service.enroll(db, automation, contacts, restart=restart)
        await db.commit()
        background_tasks.add_task(jobs.scheduler_tick)
    return ApiResponse(data=EnrollmentResult(enrolled=enrolled))


@router.get("/{automation_id}/execution-flow", response_model=ApiResponse[ExecutionFlowRead])
async def get_execution_flow(db: DbSession, automation_id: str):
    """Get live execution state of all nodes in the workflow canvas."""
    data = await automation_service.get_execution_flow(db, automation_id)
    return ApiResponse(data=ExecutionFlowRead.model_validate(data))


@router.post("/{automation_id}/advance-delay", response_model=ApiResponse[dict[str, int]])
async def advance_delay(db: DbSession, automation_id: str):
    """Advance enrollments waiting on a delay step immediately."""
    advanced = await automation_service.advance_delay(db, automation_id)
    return ApiResponse(data={"advanced": advanced})


@router.post("/{automation_id}/sync-ses", response_model=ApiResponse[SesSyncResult])
async def sync_ses(db: DbSession, automation_id: str):
    """Drain the SQS queue for per-recipient open/click events, then return a
    summary for this automation.  We deliberately skip the CloudWatch aggregate
    path here because aggregate metrics are workspace-wide and would incorrectly
    mark every recipient's email as opened the moment *any* subscriber opens theirs.
    """
    from app.services import sqs_event_service

    # 1. Flush all pending SQS events (per-recipient, real-time)
    await sqs_event_service.poll_and_process_sqs(db, max_messages=10, wait_seconds=2)
    # 2. Return a lightweight per-message summary for the canvas
    from app.services.ses_sync import summarise_automation_messages

    result = await summarise_automation_messages(db, automation_id)
    return ApiResponse(data=SesSyncResult.model_validate(result))


@router.post("/{automation_id}/poll-sqs", response_model=ApiResponse[dict[str, Any]])
async def poll_sqs(db: DbSession, automation_id: str):
    """Immediately poll and process pending events from AWS SQS."""
    from app.services import sqs_event_service

    result = await sqs_event_service.poll_and_process_sqs(db, max_messages=10, wait_seconds=2)
    return ApiResponse(data=result)


@router.post("/{automation_id}/simulate-event", response_model=ApiResponse[dict[str, bool]])
async def simulate_event(db: DbSession, automation_id: str, event: str = Query(default="open")):
    """Simulate opening or clicking the last sent email message for condition testing."""
    success = await automation_service.simulate_message_event(db, automation_id, event)
    return ApiResponse(data={"success": success})


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


@router.post("/{automation_id}/archive", response_model=ApiResponse[AutomationRead])
async def archive_automation(db: DbSession, automation_id: str):
    automation = await automation_service.set_status(db, automation_id, AutomationStatus.ARCHIVED)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post(
    "/{automation_id}/duplicate",
    response_model=ApiResponse[AutomationRead],
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_automation(db: DbSession, automation_id: str):
    automation = await automation_service.duplicate_automation(db, automation_id)
    return ApiResponse(data=AutomationRead.from_model(automation))


@router.post("/{automation_id}/validate", response_model=ApiResponse[WorkflowValidation])
async def validate_automation(db: DbSession, automation_id: str):
    automation = await automation_service.get_automation(db, automation_id)
    problems = automation_service.graph_problems(automation)
    return ApiResponse(
        data=WorkflowValidation(
            ok=not problems,
            problems=[WorkflowProblem.model_validate(item) for item in problems],
        )
    )


@router.post("/{automation_id}/test", response_model=ApiResponse[EnrollmentResult])
async def test_automation(db: DbSession, automation_id: str, body: TestSendRequest):
    await automation_service.send_test(db, automation_id, body.email, body.node_id)
    return ApiResponse(data=EnrollmentResult(enrolled=1))


@router.get("/{automation_id}/enrollments", response_model=ListResponse[EnrollmentRead])
async def list_enrollments(db: DbSession, automation_id: str, page: PageParams):
    await automation_service.get_automation(db, automation_id)
    rows, total = await automation_service.list_enrollments(
        db, automation_id, offset=page.offset, limit=page.limit
    )
    data = [
        EnrollmentRead(
            id=enrollment.id,
            contact_id=enrollment.contact_id,
            contact_name=contact.name if contact else "",
            contact_email=contact.email if contact else "",
            status=enrollment.status,
            current_node_id=enrollment.current_node_id,
            next_run_at=enrollment.next_run_at,
            completed_at=enrollment.completed_at,
            created_at=enrollment.created_at,
        )
        for enrollment, contact in rows
    ]
    return page.response(data, total)


@router.get("/{automation_id}/steps", response_model=ListResponse[StepRead])
async def list_steps(db: DbSession, automation_id: str, page: PageParams):
    await automation_service.get_automation(db, automation_id)
    rows, total = await automation_service.list_steps(
        db, automation_id, offset=page.offset, limit=page.limit
    )
    return page.response(
        [
            StepRead(
                id=step.id,
                enrollment_id=step.enrollment_id,
                node_id=step.node_id,
                action=step.action,
                result=step.result,
                created_at=step.created_at,
            )
            for step in rows
        ],
        total,
    )


@router.delete("/{automation_id}", response_model=SuccessResponse)
async def delete_automation(db: DbSession, automation_id: str):
    await automation_service.delete_automation(db, automation_id)
    return SuccessResponse()
