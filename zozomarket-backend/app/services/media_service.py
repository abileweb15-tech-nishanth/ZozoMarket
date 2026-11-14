"""Media library: pluggable S3 + resilient local storage backend plus asset metadata management."""

import asyncio
import logging
import mimetypes
import re
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path, PurePosixPath
from typing import Protocol

import anyio
import boto3
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError, PayloadTooLargeError
from app.models.media import MediaAsset, MediaType, human_size
from app.services.aws_credentials import get_aws_credentials, load_aws_credentials
from app.services.query import ilike, paginate

logger = logging.getLogger(__name__)

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
_MIME_ALIASES: dict[str, str] = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
}
_MAGIC: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/pdf": (b"%PDF",),
}
_MEDIA_KEY_RE = re.compile(r"/media/([a-f0-9]{2}/[a-f0-9]+\.[a-z0-9]+)(?:[?#].*)?$", re.IGNORECASE)


def resolve_writable_media_root(preferred: Path | None = None) -> Path:
    """Return `preferred` (or `settings.MEDIA_ROOT`) if writable, else a writable temp directory.

    Prevents 500 Internal Server Errors in production Docker/cloud deployments when
    a host volume is mounted at `/data/media` with root-only write permissions.
    """
    target = preferred or settings.MEDIA_ROOT
    try:
        target.mkdir(parents=True, exist_ok=True)
        probe = target / f".write_probe_{uuid.uuid4().hex[:8]}"
        probe.write_bytes(b"ok")
        probe.unlink(missing_ok=True)
        return target
    except OSError as exc:
        fallback = Path(tempfile.gettempdir()) / "zozomarket-media"
        fallback.mkdir(parents=True, exist_ok=True)
        logger.warning(
            "MEDIA_ROOT '%s' is not writable (%s); falling back to '%s'",
            target,
            exc,
            fallback,
        )
        return fallback


class StorageBackend(Protocol):
    async def save(self, key: str, chunks: AsyncIterator[bytes], max_bytes: int) -> int: ...
    async def delete(self, key: str) -> None: ...
    def url(self, key: str) -> str: ...


class LocalStorage:
    """Stores files under a writable root and serves them via the /media static mount.
    Also uploads to Amazon S3 when workspace S3 bucket is configured."""

    def __init__(self, root: Path) -> None:
        self.root = resolve_writable_media_root(root)
        self._s3_uploaded_keys: set[str] = set()

    def _path(self, key: str) -> Path:
        root_resolved = self.root.resolve()
        path = (self.root / key).resolve()
        if not path.is_relative_to(root_resolved):
            raise AppError("Invalid storage key")
        return path

    async def save(self, key: str, chunks: AsyncIterator[bytes], max_bytes: int) -> int:
        try:
            path = self._path(key)
            await anyio.Path(path.parent).mkdir(parents=True, exist_ok=True)
        except OSError:
            self.root = resolve_writable_media_root(Path(tempfile.gettempdir()) / "zozomarket-media")
            path = self._path(key)
            await anyio.Path(path.parent).mkdir(parents=True, exist_ok=True)

        size = 0
        buffer = bytearray()
        try:
            async with await anyio.open_file(path, "wb") as fh:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > max_bytes:
                        raise PayloadTooLargeError(
                            f"File exceeds the {settings.MEDIA_MAX_UPLOAD_MB} MB limit"
                        )
                    buffer.extend(chunk)
                    await fh.write(chunk)
        except BaseException:
            await anyio.Path(path).unlink(missing_ok=True)
            raise

        # If S3 media storage is enabled on the workspace, mirror the object to S3
        creds = get_aws_credentials()
        if creds and creds.s3_media_enabled and creds.s3_bucket_name:
            mime = mimetypes.guess_type(key)[0] or "application/octet-stream"
            uploaded = await asyncio.to_thread(
                _upload_to_s3_sync,
                creds.access_key_id,
                creds.secret_access_key,
                creds.region,
                creds.s3_bucket_name,
                key,
                bytes(buffer),
                mime,
            )
            if uploaded:
                self._s3_uploaded_keys.add(key)

        return size

    async def delete(self, key: str) -> None:
        self._s3_uploaded_keys.discard(key)
        await anyio.Path(self._path(key)).unlink(missing_ok=True)
        creds = get_aws_credentials()
        if creds and creds.s3_media_enabled and creds.s3_bucket_name:
            await asyncio.to_thread(
                _delete_from_s3_sync,
                creds.access_key_id,
                creds.secret_access_key,
                creds.region,
                creds.s3_bucket_name,
                key,
            )

    def url(self, key: str) -> str:
        creds = get_aws_credentials()
        if (
            creds
            and creds.s3_media_enabled
            and creds.s3_bucket_name
            and key in self._s3_uploaded_keys
        ):
            return f"https://{creds.s3_bucket_name}.s3.{creds.region}.amazonaws.com/media/{key}"
        base = settings.PUBLIC_BASE_URL.rstrip("/")
        return f"{base}{settings.MEDIA_URL_PATH}/{key}"


def _upload_to_s3_sync(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    bucket: str,
    key: str,
    data: bytes,
    content_type: str,
) -> bool:
    try:
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )
        s3.put_object(
            Bucket=bucket,
            Key=f"media/{key}",
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        return True
    except Exception as exc:
        logger.warning("Failed to upload media '%s' to S3 bucket '%s': %s", key, bucket, exc)
        return False


def _delete_from_s3_sync(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    bucket: str,
    key: str,
) -> None:
    try:
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )
        s3.delete_object(Bucket=bucket, Key=f"media/{key}")
    except Exception as exc:
        logger.debug("Failed to delete media '%s' from S3: %s", key, exc)


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        _storage = LocalStorage(settings.MEDIA_ROOT)
    return _storage


def read_local_media_bytes(url: str) -> tuple[bytes, str, str] | None:
    """Resolve a `/media/<key>` URL to `(bytes, mime_type, filename)` if stored locally.

    Used by `ses_email.py` to automatically embed local/localhost images as inline
    CID MIME attachments so they render in Gmail, Outlook, and Apple Mail.
    """
    if not url:
        return None
    match = _MEDIA_KEY_RE.search(url.strip())
    if not match:
        return None
    rel_key = match.group(1)
    storage = get_storage()
    candidates: list[Path] = []
    if isinstance(storage, LocalStorage):
        candidates.append(storage.root / rel_key)
    candidates.append(settings.MEDIA_ROOT / rel_key)
    candidates.append(Path(tempfile.gettempdir()) / "zozomarket-media" / rel_key)

    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            if resolved.is_file():
                data = resolved.read_bytes()
                mime = mimetypes.guess_type(resolved.name)[0] or "image/png"
                return data, mime, resolved.name
        except OSError:
            continue
    return None


def sanitize_filename(name: str) -> str:
    name = PurePosixPath(name.replace("\\", "/")).name
    name = re.sub(r"[^\w.\- ()]+", "_", name).strip(" .")
    return name[:255] or "file"


def classify(filename: str, content_type: str | None) -> tuple[str, MediaType, str]:
    ext = Path(filename).suffix.lower()
    mime = (content_type or "").split(";")[0].strip().lower()
    mime = _MIME_ALIASES.get(mime, mime)
    if mime not in ALLOWED_TYPES:
        guessed = (mimetypes.guess_type(filename)[0] or "").lower()
        mime = _MIME_ALIASES.get(guessed, guessed)
    if mime not in ALLOWED_TYPES:
        for candidate_mime, (_, exts) in ALLOWED_TYPES.items():
            if ext in exts:
                mime = candidate_mime
                break
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

    if get_aws_credentials() is None:
        await load_aws_credentials(session)

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
        await session.refresh(asset)
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
    await session.refresh(asset)
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
