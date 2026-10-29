from datetime import datetime
from typing import Any, Literal
from pydantic import Field

from app.models.contact import SubscriptionStatus
from app.schemas.common import CamelModel, InputModel


class SegmentConditionInput(InputModel):
    tags: list[str] = Field(default_factory=list)
    match_type: Literal["any", "all"] = "any"
    status: SubscriptionStatus | None = None
    source: str | None = None


class SegmentCreate(InputModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    tags: list[str] = Field(default_factory=list)
    match_type: Literal["any", "all"] = "any"
    status: SubscriptionStatus | None = None
    source: str | None = None


class SegmentUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = None
    match_type: Literal["any", "all"] | None = None
    status: SubscriptionStatus | None = None
    source: str | None = None


class SegmentRead(CamelModel):
    id: str
    name: str
    description: str
    tags: list[str]
    match_type: str
    status: str | None
    source: str | None
    contact_count: int = 0
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, segment: Any, contact_count: int = 0) -> "SegmentRead":
        return cls(
            id=segment.id,
            name=segment.name,
            description=segment.description,
            tags=segment.tags or [],
            match_type=segment.match_type,
            status=segment.status,
            source=segment.source,
            contact_count=contact_count,
            created_at=segment.created_at,
            updated_at=segment.updated_at,
        )


class SegmentPreview(CamelModel):
    count: int
