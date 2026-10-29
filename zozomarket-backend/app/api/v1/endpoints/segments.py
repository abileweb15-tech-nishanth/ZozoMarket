from fastapi import APIRouter, status

from app.api.deps import DbSession, PageParams
from app.schemas.common import ApiResponse, ListResponse, SuccessResponse
from app.schemas.contact import ContactRead
from app.schemas.segment import (
    SegmentConditionInput,
    SegmentCreate,
    SegmentPreview,
    SegmentRead,
    SegmentUpdate,
)
from app.services import segment_service

router = APIRouter(prefix="/segments", tags=["Segments"])


@router.get("", response_model=ApiResponse[list[SegmentRead]])
async def list_segments(db: DbSession):
    rows = await segment_service.list_segments(db)
    return ApiResponse(data=[SegmentRead.from_model(s, count) for s, count in rows])


@router.post("", response_model=ApiResponse[SegmentRead], status_code=status.HTTP_201_CREATED)
async def create_segment(db: DbSession, body: SegmentCreate):
    segment, count = await segment_service.create_segment(db, body)
    return ApiResponse(data=SegmentRead.from_model(segment, count))


@router.post("/preview", response_model=ApiResponse[SegmentPreview])
async def preview_segment_count(db: DbSession, body: SegmentConditionInput):
    count = await segment_service.count_contacts_for_segment(db, body)
    return ApiResponse(data=SegmentPreview(count=count))


@router.get("/{segment_id}", response_model=ApiResponse[SegmentRead])
async def get_segment(db: DbSession, segment_id: str):
    segment, count = await segment_service.get_segment(db, segment_id)
    return ApiResponse(data=SegmentRead.from_model(segment, count))


@router.patch("/{segment_id}", response_model=ApiResponse[SegmentRead])
async def update_segment(db: DbSession, segment_id: str, body: SegmentUpdate):
    segment, count = await segment_service.update_segment(db, segment_id, body)
    return ApiResponse(data=SegmentRead.from_model(segment, count))


@router.delete("/{segment_id}", response_model=SuccessResponse)
async def delete_segment(db: DbSession, segment_id: str):
    await segment_service.delete_segment(db, segment_id)
    return SuccessResponse()


@router.get("/{segment_id}/contacts", response_model=ListResponse[ContactRead])
async def list_segment_contacts(db: DbSession, segment_id: str, page: PageParams):
    items, total = await segment_service.list_segment_contacts(
        db, segment_id, offset=page.offset, limit=page.limit
    )
    return page.response([ContactRead.from_model(c) for c in items], total)
