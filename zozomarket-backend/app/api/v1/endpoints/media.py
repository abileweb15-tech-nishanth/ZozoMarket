from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import DbSession, PageParams
from app.core.exceptions import AppError
from app.models.media import MediaType
from app.schemas.common import ApiResponse, ListResponse, SuccessResponse
from app.schemas.media import MediaRead, MediaRename, MediaUsage
from app.services import media_service

router = APIRouter(prefix="/media", tags=["Media"])

MAX_FILES_PER_REQUEST = 20


@router.get("", response_model=ListResponse[MediaRead])
async def list_media(
    db: DbSession,
    page: PageParams,
    type_: MediaType | None = Query(default=None, alias="type"),
    q: str | None = Query(default=None, max_length=200),
):
    items, total = await media_service.list_assets(
        db, type_=type_, q=q, offset=page.offset, limit=page.limit
    )
    return page.response([MediaRead.from_model(m) for m in items], total)


@router.get("/usage", response_model=ApiResponse[MediaUsage])
async def media_usage(db: DbSession):
    return ApiResponse(data=MediaUsage(**await media_service.usage(db)))


@router.post("", response_model=ApiResponse[list[MediaRead]], status_code=status.HTTP_201_CREATED)
async def upload_media(db: DbSession, files: list[UploadFile] = File(...)):
    """Upload one or more files (multipart field name `files`)."""
    if len(files) > MAX_FILES_PER_REQUEST:
        raise AppError(f"At most {MAX_FILES_PER_REQUEST} files per request")
    assets = [await media_service.upload(db, f) for f in files]
    return ApiResponse(data=[MediaRead.from_model(a) for a in assets])


@router.get("/{asset_id}", response_model=ApiResponse[MediaRead])
async def get_media(db: DbSession, asset_id: str):
    return ApiResponse(data=MediaRead.from_model(await media_service.get_asset(db, asset_id)))


@router.patch("/{asset_id}", response_model=ApiResponse[MediaRead])
async def rename_media(db: DbSession, asset_id: str, body: MediaRename):
    return ApiResponse(
        data=MediaRead.from_model(await media_service.rename(db, asset_id, body.name))
    )


@router.delete("/{asset_id}", response_model=SuccessResponse)
async def delete_media(db: DbSession, asset_id: str):
    await media_service.delete(db, asset_id)
    return SuccessResponse()
