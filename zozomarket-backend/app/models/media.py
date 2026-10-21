from enum import StrEnum

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin, WorkspaceMixin, str_enum


class MediaType(StrEnum):
    IMAGE = "Image"
    VIDEO = "Video"
    DOCUMENT = "Document"
    OTHER = "Other"


class MediaAsset(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "media_assets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[MediaType] = mapped_column(
        str_enum(MediaType), default=MediaType.OTHER, index=True, nullable=False
    )
    mime_type: Mapped[str] = mapped_column(String(127), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    # Storage-backend key (None for externally hosted / seeded assets).
    storage_key: Mapped[str | None] = mapped_column(String(500), unique=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)

    @property
    def size_label(self) -> str:
        return human_size(self.size_bytes)


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB"):
        if size < 1024:
            return f"{size:.0f} {unit}" if unit != "MB" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"
