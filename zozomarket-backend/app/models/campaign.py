from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UTCDateTime, UUIDMixin, WorkspaceMixin, str_enum


class CampaignStatus(StrEnum):
    DRAFT = "Draft"
    SCHEDULED = "Scheduled"
    SENDING = "Sending"
    SENT = "Sent"
    FAILED = "Failed"


class CampaignType(StrEnum):
    NEWSLETTER = "Newsletter"
    PROMOTIONAL = "Promotional"
    AUTOMATED = "Automated"
    ANNOUNCEMENT = "Announcement"


EDITABLE_STATUSES = frozenset({CampaignStatus.DRAFT, CampaignStatus.SCHEDULED})


class Campaign(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "campaigns"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[CampaignType] = mapped_column(
        str_enum(CampaignType), default=CampaignType.NEWSLETTER, nullable=False
    )
    status: Mapped[CampaignStatus] = mapped_column(
        str_enum(CampaignStatus), default=CampaignStatus.DRAFT, index=True, nullable=False
    )

    # Targeting: human label shown in the UI + tag filter. Empty tags => all subscribed contacts.
    audience: Mapped[str] = mapped_column(String(120), default="All Subscribers", nullable=False)
    audience_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Content
    subject: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    preheader: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    from_name: Mapped[str | None] = mapped_column(String(120))
    from_email: Mapped[str | None] = mapped_column(String(320))
    reply_to: Mapped[str | None] = mapped_column(String(320))
    template_id: Mapped[str | None] = mapped_column(
        ForeignKey("email_templates.id", ondelete="SET NULL")
    )
    html: Mapped[str] = mapped_column(Text, default="", nullable=False)
    design: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    # Lifecycle
    scheduled_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), index=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    failure_reason: Mapped[str | None] = mapped_column(Text)

    # Denormalised counters (unique per recipient) kept in sync by analytics_service.
    recipients: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delivered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opened_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicked_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bounced_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unsubscribed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    @staticmethod
    def _pct(part: int, whole: int) -> float | None:
        return round(part * 100 / whole, 1) if whole else None

    @property
    def delivery_rate(self) -> float | None:
        return self._pct(self.delivered_count, self.sent_count)

    @property
    def open_rate(self) -> float | None:
        return self._pct(self.opened_count, self.delivered_count) if self.sent_count else None

    @property
    def click_rate(self) -> float | None:
        return self._pct(self.clicked_count, self.delivered_count) if self.sent_count else None

    @property
    def bounce_rate(self) -> float | None:
        return self._pct(self.bounced_count, self.sent_count)

    @property
    def effective_at(self) -> datetime:
        return self.sent_at or self.started_at or self.scheduled_at or self.created_at
