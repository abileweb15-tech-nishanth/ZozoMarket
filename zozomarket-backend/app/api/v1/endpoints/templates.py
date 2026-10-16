from fastapi import APIRouter, Query, status
from fastapi.responses import HTMLResponse

from app.api.deps import DbSession, PageParams
from app.schemas.common import ApiResponse, ListResponse, SuccessResponse
from app.schemas.template import (
    CategoryCount,
    PreviewRequest,
    RenderedEmail,
    RenderRequest,
    TemplateCreate,
    TemplateDetail,
    TemplateRead,
    TemplateUpdate,
)
from app.services import template_service
from app.services.template_service import (
    SAMPLE_VARIABLES,
    ensure_preheader,
    html_to_text,
    render_blocks,
    render_merge_tags,
    template_html,
)

router = APIRouter(prefix="/templates", tags=["Templates"])


def _rendered(html: str, variables: dict[str, str] | None) -> RenderedEmail:
    merged = {**SAMPLE_VARIABLES, **(variables or {})}
    out = render_merge_tags(html, merged)
    return RenderedEmail(html=out, text=html_to_text(out))


@router.get("", response_model=ListResponse[TemplateRead])
async def list_templates(
    db: DbSession,
    page: PageParams,
    category: str | None = Query(default=None, max_length=64),
    q: str | None = Query(default=None, max_length=200),
):
    items, total = await template_service.list_templates(
        db, category=category, q=q, offset=page.offset, limit=page.limit
    )
    return page.response([TemplateRead.from_model(t) for t in items], total)


@router.get("/categories", response_model=ApiResponse[list[CategoryCount]])
async def list_categories(db: DbSession):
    rows = await template_service.category_counts(db)
    return ApiResponse(data=[CategoryCount(name=n, count=c) for n, c in rows])


@router.post("/render", response_model=ApiResponse[RenderedEmail])
async def render_design(body: RenderRequest):
    """Render visual-builder blocks to email-safe HTML without saving."""
    html = render_blocks([b.model_dump() for b in body.design], body.preheader)
    return ApiResponse(data=_rendered(html, body.variables))


@router.post("", response_model=ApiResponse[TemplateDetail], status_code=status.HTTP_201_CREATED)
async def create_template(db: DbSession, body: TemplateCreate):
    return ApiResponse(
        data=TemplateDetail.model_validate(await template_service.create_template(db, body))
    )


@router.get("/{template_id}", response_model=ApiResponse[TemplateDetail])
async def get_template(db: DbSession, template_id: str):
    return ApiResponse(
        data=TemplateDetail.model_validate(await template_service.get_template(db, template_id))
    )


@router.patch("/{template_id}", response_model=ApiResponse[TemplateDetail])
async def update_template(db: DbSession, template_id: str, body: TemplateUpdate):
    template = await template_service.update_template(db, template_id, body)
    return ApiResponse(data=TemplateDetail.model_validate(template))


@router.post(
    "/{template_id}/duplicate",
    response_model=ApiResponse[TemplateDetail],
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_template(db: DbSession, template_id: str):
    template = await template_service.duplicate_template(db, template_id)
    return ApiResponse(data=TemplateDetail.model_validate(template))


@router.post("/{template_id}/preview", response_model=ApiResponse[RenderedEmail])
async def preview_template(db: DbSession, template_id: str, body: PreviewRequest | None = None):
    template = await template_service.get_template(db, template_id)
    html = ensure_preheader(template_html(template), template.preheader)
    return ApiResponse(data=_rendered(html, body.variables if body else None))


@router.get("/{template_id}/preview.html", response_class=HTMLResponse)
async def preview_template_html(db: DbSession, template_id: str):
    """Raw HTML preview for <iframe sandbox> embedding in the template gallery."""
    template = await template_service.get_template(db, template_id)
    html = _rendered(ensure_preheader(template_html(template), template.preheader), None).html
    return HTMLResponse(html, headers={"Content-Security-Policy": "script-src 'none'; sandbox"})


@router.delete("/{template_id}", response_model=SuccessResponse)
async def delete_template(db: DbSession, template_id: str):
    await template_service.delete_template(db, template_id)
    return SuccessResponse()
