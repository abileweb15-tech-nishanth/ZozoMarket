from datetime import datetime

from pydantic import Field

from app.models.media import MediaAsset, MediaType
from app.schemas.common import CamelModel, InputModel


class MediaRead(CamelModel):
    id: str
    name: str
    type: MediaType
    size: str
    size_bytes: int
    src: str
    mime_type: str
    created_at: datetime

    @classmethod
    def from_model(cls, m: MediaAsset) -> "MediaRead":
        return cls(
            id=m.id,
            name=m.name,
            type=m.type,
            size=m.size_label,
            size_bytes=m.size_bytes,
            src=m.url,
            mime_type=m.mime_type,
            created_at=m.created_at,
        )


class MediaRename(InputModel):
    name: str = Field(min_length=1, max_length=255)


class MediaUsage(CamelModel):
    total_assets: int
    total_bytes: int
    total_size: str
    by_type: dict[str, int]
