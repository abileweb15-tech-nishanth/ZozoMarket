from datetime import date, datetime
from typing import Any

from pydantic import EmailStr, Field, field_validator

from app.models.contact import Contact, SubscriptionStatus
from app.schemas.common import CamelModel, IdList, InputModel


def _clean_tags(tags: list[str] | None) -> list[str] | None:
    if tags is None:
        return None
    seen: dict[str, None] = {}
    for tag in tags:
        tag = tag.strip()
        if tag:
            seen.setdefault(tag[:64], None)
    return list(seen)


class ContactBase(InputModel):
    name: str = Field(default="", max_length=200)
    tags: list[str] = Field(default_factory=list, max_length=50)
    source: str = Field(default="Manual", max_length=64)
    status: SubscriptionStatus = SubscriptionStatus.SUBSCRIBED
    attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str]) -> list[str]:
        return _clean_tags(v) or []


class ContactCreate(ContactBase):
    email: EmailStr


class ContactUpdate(InputModel):
    name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    tags: list[str] | None = Field(default=None, max_length=50)
    source: str | None = Field(default=None, max_length=64)
    status: SubscriptionStatus | None = None
    attributes: dict[str, Any] | None = None

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        return _clean_tags(v)


class ContactRead(CamelModel):
    id: str
    name: str
    email: str
    tags: list[str]
    source: str
    status: SubscriptionStatus
    added: date
    attributes: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, c: Contact) -> "ContactRead":
        return cls(
            id=c.id,
            name=c.name,
            email=c.email,
            tags=c.tag_names,
            source=c.source,
            status=c.status,
            added=c.created_at.date(),
            attributes=c.attributes or {},
            created_at=c.created_at,
            updated_at=c.updated_at,
        )


class BulkTagRequest(IdList):
    tag: str = Field(min_length=1, max_length=64)


class BulkStatusRequest(IdList):
    status: SubscriptionStatus


class ImportResult(CamelModel):
    created: int
    updated: int
    skipped: int
    errors: list[dict[str, Any]]


class TagCount(CamelModel):
    name: str
    count: int


class ContactStats(CamelModel):
    total: int
    subscribed: int
    unsubscribed: int
    pending: int
