"""Media library: pluggable storage backend plus asset metadata management."""

import mimetypes
import re
import uuid
from collections.abc import AsyncIterator
from pathlib import Path, PurePosixPath
from typing import Protocol

import anyio
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError, PayloadTooLargeError
from app.models.media import MediaAsset, MediaType, human_size
from app.services.query import ilike, paginate

CHUNK_SIZE = 1024 * 1024

# SVG/HTML are deliberately excluded: served from our origin they enable stored XSS.
ALLOWED_TYPES: dict[str, tuple[MediaType, set[str]]] = {
    "image/png": (MediaType.IMAGE, {".png"}),
    "image/jpeg": (MediaType.IMAGE, {".jpg", ".jpeg"}),
    "image/gif": (MediaType.IMAGE, {".gif"}),
    "image/webp": (MediaType.IMAGE, {".webp"}),
    "video/mp4": (MediaType.VIDEO, {".mp4"}),
    "video/webm": (MediaType.VIDEO, {".webm"}),
    "video/quicktime": (MediaType.VIDEO, {".mov"}),
    "application/pdf": (MediaType.DOCUMENT, {".pdf"}),
}
_MAGIC: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/pdf": (b"%PDF",),
}


class StorageBackend(Protocol):
    async def save(self, key: str, chunks: AsyncIterator[bytes], max_bytes: int) -> int: ...
    async def delete(self, key: str) -> None: ...
    def url(self, key: str) -> str: ...


class LocalStorage:
    """Stores files under MEDIA_ROOT and serves them via the /media static mount.
    Swap for an S3/GCS implementation of `StorageBackend` in multi-instance deployments."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise AppError("Invalid storage key")
        return path

    async def save(self, key: str, chunks: AsyncIterator[bytes], max_bytes: int) -> int:
        path = self._path(key)
        await anyio.Path(path.parent).mkdir(parents=True, exist_ok=True)
        size = 0
        try:
            async with await anyio.open_file(path, "wb") as fh:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > max_bytes:
                        raise PayloadTooLargeError(
                            f"File exceeds the {settings.MEDIA_MAX_UPLOAD_MB} MB limit"
                        )
                    await fh.write(chunk)
        except BaseException:
            await anyio.Path(path).unlink(missing_ok=True)
            raise
        return size

    async def delete(self, key: str) -> None:
        await anyio.Path(self._path(key)).unlink(missing_ok=True)

    def url(self, key: str) -> str:
        base = settings.PUBLIC_BASE_URL.rstrip("/")
        return f"{base}{settings.MEDIA_URL_PATH}/{key}"


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        _storage = LocalStorage(settings.MEDIA_ROOT)
    return _storage


def sanitize_filename(name: str) -> str:
    name = PurePosixPath(name.replace("\\", "/")).name
    name = re.sub(r"[^\w.\- ()]+", "_", name).strip(" .")
    return name[:255] or "file"


def classify(filename: str, content_type: str | None) -> tuple[str, MediaType, str]:
    ext = Path(filename).suffix.lower()
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_TYPES:
        mime = mimetypes.guess_type(filename)[0] or ""
    if mime not in ALLOWED_TYPES or ext not in ALLOWED_TYPES[mime][1]:
        allowed = sorted({e for _, exts in ALLOWED_TYPES.values() for e in exts})
        raise AppError(
            f"Unsupported file type. Allowed: {', '.join(allowed)}", code="unsupported_media_type"
        )
    return mime, ALLOWED_TYPES[mime][0], ext


async def upload(session: AsyncSession, file: UploadFile) -> MediaAsset:
    filename = sanitize_filename(file.filename or "file")
    mime, media_type, ext = classify(filename, file.content_type)

    head = await file.read(16)
    signatures = _MAGIC.get(mime)
    if signatures and not any(head.startswith(sig) for sig in signatures):
        raise AppError("File content does not match its type", code="unsupported_media_type")

    async def chunks() -> AsyncIterator[bytes]:
        yield head
        while chunk := await file.read(CHUNK_SIZE):
            yield chunk

    key = f"{uuid.uuid4().hex[:2]}/{uuid.uuid4().hex}{ext}"
    storage = get_storage()
    size = await storage.save(key, chunks(), settings.media_max_upload_bytes)
    asset = MediaAsset(
        name=filename,
        type=media_type,
        mime_type=mime,
        size_bytes=size,
        storage_key=key,
        url=storage.url(key),
    )
    session.add(asset)
    try:
        await session.commit()
    except Exception:
        await storage.delete(key)
        raise
    return asset


async def list_assets(
    session: AsyncSession, *, type_: MediaType | None, q: str | None, offset: int, limit: int
) -> tuple[list[MediaAsset], int]:
    stmt = select(MediaAsset)
    if type_:
        stmt = stmt.where(MediaAsset.type == type_)
    if q:
        stmt = stmt.where(ilike(MediaAsset.name, q))
    return await paginate(
        session, stmt.order_by(MediaAsset.created_at.desc()), offset=offset, limit=limit
    )


async def get_asset(session: AsyncSession, asset_id: str) -> MediaAsset:
    asset = await session.get(MediaAsset, asset_id)
    if asset is None:
        raise NotFoundError(f"Asset {asset_id} not found")
    return asset


async def rename(session: AsyncSession, asset_id: str, name: str) -> MediaAsset:
    asset = await get_asset(session, asset_id)
    new_name = sanitize_filename(name)
    old_ext = Path(asset.name).suffix
    if old_ext and not new_name.lower().endswith(old_ext.lower()):
        new_name = f"{new_name}{old_ext}"  # keep the extension so the file stays recognisable
    asset.name = new_name
    await session.commit()
    return asset


async def delete(session: AsyncSession, asset_id: str) -> None:
    asset = await get_asset(session, asset_id)
    key = asset.storage_key
    await session.delete(asset)
    await session.commit()
    if key:
        await get_storage().delete(key)


async def usage(session: AsyncSession) -> dict:
    rows = await session.execute(
        select(
            MediaAsset.type, func.count(), func.coalesce(func.sum(MediaAsset.size_bytes), 0)
        ).group_by(MediaAsset.type)
    )
    by_type, total_count, total_bytes = {}, 0, 0
    for media_type, count, size in rows.all():
        by_type[media_type.value] = count
        total_count += count
        total_bytes += int(size)
    return {
        "total_assets": total_count,
        "total_bytes": total_bytes,
        "total_size": human_size(total_bytes),
        "by_type": by_type,
    }
