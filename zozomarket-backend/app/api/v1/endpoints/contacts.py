from datetime import date

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, PageParams
from app.core.exceptions import PayloadTooLargeError
from app.models.contact import SubscriptionStatus
from app.schemas.common import AffectedCount, ApiResponse, IdList, ListResponse, SuccessResponse
from app.schemas.contact import (
    BulkStatusRequest,
    BulkTagRequest,
    ContactCreate,
    ContactRead,
    ContactStats,
    ContactUpdate,
    ImportResult,
    TagCount,
)
from app.services import contact_service
from app.services.contact_service import SortField

router = APIRouter(prefix="/contacts", tags=["Contacts"])

MAX_CSV_BYTES = 20 * 1024 * 1024


@router.get("", response_model=ListResponse[ContactRead])
async def list_contacts(
    db: DbSession,
    page: PageParams,
    q: str | None = Query(default=None, max_length=200),
    status_: SubscriptionStatus | None = Query(default=None, alias="status"),
    tag: str | None = Query(default=None, max_length=64),
    source: str | None = Query(default=None, max_length=64),
    sort: SortField = "-added",
):
    items, total = await contact_service.list_contacts(
        db,
        q=q,
        status=status_,
        tag=tag,
        source=source,
        sort=sort,
        offset=page.offset,
        limit=page.limit,
    )
    return page.response([ContactRead.from_model(c) for c in items], total)


@router.get("/stats", response_model=ApiResponse[ContactStats])
async def contact_stats(db: DbSession):
    return ApiResponse(data=ContactStats(**await contact_service.stats(db)))


@router.get("/tags", response_model=ApiResponse[list[TagCount]])
async def list_tags(db: DbSession):
    rows = await contact_service.tag_counts(db)
    return ApiResponse(data=[TagCount(name=n, count=c) for n, c in rows])


@router.get("/export", response_class=StreamingResponse)
async def export_contacts(
    db: DbSession,
    q: str | None = Query(default=None, max_length=200),
    status_: SubscriptionStatus | None = Query(default=None, alias="status"),
    tag: str | None = Query(default=None, max_length=64),
    source: str | None = Query(default=None, max_length=64),
):
    filename = f"contacts-{date.today().isoformat()}.csv"
    return StreamingResponse(
        contact_service.export_csv(db, q=q, status=status_, tag=tag, source=source),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ApiResponse[ImportResult])
async def import_contacts(
    db: DbSession,
    file: UploadFile = File(..., description="CSV with columns: email, name, tags, status, source"),
    tags: str = Form(default="", description="Comma-separated tags applied to every row"),
    update_existing: bool = Form(default=True, alias="updateExisting"),
):
    """Upserts by email. Unsubscribed contacts are never resubscribed by an import."""
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise PayloadTooLargeError(f"CSV exceeds {MAX_CSV_BYTES // (1024 * 1024)} MB")
    result = await contact_service.import_csv(
        db,
        content,
        default_tags=[t.strip() for t in tags.split(",") if t.strip()],
        update_existing=update_existing,
    )
    return ApiResponse(data=ImportResult(**result))


@router.post("/bulk-delete", response_model=ApiResponse[AffectedCount])
async def bulk_delete(db: DbSession, body: IdList):
    return ApiResponse(data=AffectedCount(affected=await contact_service.bulk_delete(db, body.ids)))


@router.post("/bulk-tag", response_model=ApiResponse[AffectedCount])
async def bulk_add_tag(db: DbSession, body: BulkTagRequest):
    count = await contact_service.bulk_add_tag(db, body.ids, body.tag)
    return ApiResponse(data=AffectedCount(affected=count))


@router.post("/bulk-untag", response_model=ApiResponse[AffectedCount])
async def bulk_remove_tag(db: DbSession, body: BulkTagRequest):
    count = await contact_service.bulk_remove_tag(db, body.ids, body.tag)
    return ApiResponse(data=AffectedCount(affected=count))


@router.post("/bulk-status", response_model=ApiResponse[AffectedCount])
async def bulk_set_status(db: DbSession, body: BulkStatusRequest):
    count = await contact_service.bulk_set_status(db, body.ids, body.status)
    return ApiResponse(data=AffectedCount(affected=count))


@router.post("", response_model=ApiResponse[ContactRead], status_code=status.HTTP_201_CREATED)
async def create_contact(db: DbSession, body: ContactCreate):
    contact = await contact_service.create_contact(db, body)
    return ApiResponse(data=ContactRead.from_model(contact))


@router.get("/{contact_id}", response_model=ApiResponse[ContactRead])
async def get_contact(db: DbSession, contact_id: str):
    return ApiResponse(
        data=ContactRead.from_model(await contact_service.get_contact(db, contact_id))
    )


@router.patch("/{contact_id}", response_model=ApiResponse[ContactRead])
async def update_contact(db: DbSession, contact_id: str, body: ContactUpdate):
    contact = await contact_service.update_contact(db, contact_id, body)
    return ApiResponse(data=ContactRead.from_model(contact))


@router.delete("/{contact_id}", response_model=SuccessResponse)
async def delete_contact(db: DbSession, contact_id: str):
    await contact_service.delete_contact(db, contact_id)
    return SuccessResponse()
