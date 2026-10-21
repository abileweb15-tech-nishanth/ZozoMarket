from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Column, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UTCDateTime, UUIDMixin, WorkspaceMixin, str_enum


class SubscriptionStatus(StrEnum):
    SUBSCRIBED = "Subscribed"
    UNSUBSCRIBED = "Unsubscribed"
    PENDING = "Pending"


contact_tags = Table(
    "contact_tags",
    Base.metadata,
    Column("contact_id", ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(UUIDMixin, WorkspaceMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)

    name: Mapped[str] = mapped_column(String(64), nullable=False)


class Contact(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("workspace_id", "email"),)

    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="Manual", nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        str_enum(SubscriptionStatus),
        default=SubscriptionStatus.SUBSCRIBED,
        index=True,
        nullable=False,
    )
    attributes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    subscribed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    unsubscribed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    tags: Mapped[list[Tag]] = relationship(secondary=contact_tags, lazy="selectin")

    @property
    def tag_names(self) -> list[str]:
        return sorted(t.name for t in self.tags)

    @property
    def first_name(self) -> str:
        return self.name.split(" ", 1)[0] if self.name else ""
