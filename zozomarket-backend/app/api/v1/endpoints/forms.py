from fastapi import APIRouter, Query, status
from fastapi.responses import HTMLResponse

from app.api.deps import DbSession, PageParams
from app.models.form import FormKind, FormStatus
from app.schemas.common import ApiResponse, ListResponse, SuccessResponse
from app.schemas.form import (
    FormCreate,
    FormRead,
    FormSubmission,
    FormSubmissionResult,
    FormUpdate,
    PublicFormConfig,
)
from app.services import email_service, form_service

router = APIRouter(prefix="/forms", tags=["Forms"])
# Unauthenticated endpoints embedded on customer websites / landing pages.
public_router = APIRouter(prefix="/public", tags=["Public forms"])


def _read(form) -> FormRead:
    return FormRead.from_model(form, form_service.public_url(form))


@router.get("", response_model=ListResponse[FormRead])
async def list_forms(
    db: DbSession,
    page: PageParams,
    kind: FormKind | None = None,
    status_: FormStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=200),
):
    items, total = await form_service.list_forms(
        db, kind=kind, status=status_, q=q, offset=page.offset, limit=page.limit
    )
    return page.response([_read(f) for f in items], total)


@router.post("", response_model=ApiResponse[FormRead], status_code=status.HTTP_201_CREATED)
async def create_form(db: DbSession, body: FormCreate):
    return ApiResponse(data=_read(await form_service.create_form(db, body)))


@router.get("/{form_id}", response_model=ApiResponse[FormRead])
async def get_form(db: DbSession, form_id: str):
    return ApiResponse(data=_read(await form_service.get_form(db, form_id)))


@router.patch("/{form_id}", response_model=ApiResponse[FormRead])
async def update_form(db: DbSession, form_id: str, body: FormUpdate):
    """Set `status` to "Live" to publish, "Paused" to stop accepting submissions."""
    return ApiResponse(data=_read(await form_service.update_form(db, form_id, body)))


@router.delete("/{form_id}", response_model=SuccessResponse)
async def delete_form(db: DbSession, form_id: str):
    await form_service.delete_form(db, form_id)
    return SuccessResponse()


# --- Public ------------------------------------------------------------------------


@public_router.get("/forms/{slug}", response_model=ApiResponse[PublicFormConfig])
async def public_form_config(db: DbSession, slug: str):
    form = await form_service.get_live_form(db, slug)
    return ApiResponse(data=PublicFormConfig.model_validate(form))


@public_router.post("/forms/{slug}/view", response_model=SuccessResponse)
async def public_form_view(db: DbSession, slug: str):
    await form_service.record_view(db, slug)
    return SuccessResponse()


@public_router.post("/forms/{slug}/submit", response_model=ApiResponse[FormSubmissionResult])
async def public_form_submit(db: DbSession, slug: str, body: FormSubmission):
    result = await form_service.submit(db, slug, body)
    return ApiResponse(data=FormSubmissionResult(**result))


@public_router.get("/pages/{slug}", response_class=HTMLResponse)
async def public_landing_page(db: DbSession, slug: str):
    """Hosted landing page for the form (counts a view on each load)."""
    form = await form_service.get_live_form(db, slug)
    await form_service.record_view(db, slug)
    submit_url = email_service.api_url(f"/public/forms/{slug}/submit")
    return HTMLResponse(form_service.render_landing_page(form, submit_url))


@public_router.get("/confirm/{token}", response_class=HTMLResponse)
async def confirm_subscription(db: DbSession, token: str):
    await form_service.confirm(db, token)
    return HTMLResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;text-align:center;"
        "padding:64px'><h1>You're subscribed!</h1><p>Thanks for confirming.</p></body></html>"
    )
