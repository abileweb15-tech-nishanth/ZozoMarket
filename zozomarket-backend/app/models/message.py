"""Per-recipient email messages and daily aggregated delivery statistics."""

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UTCDateTime, UUIDMixin, str_enum


class MessageStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    BOUNCED = "bounced"
    FAILED = "failed"


class EmailMessage(UUIDMixin, TimestampMixin, Base):
    """One email to one contact. The unique constraint makes campaign dispatch idempotent."""

    __tablename__ = "email_messages"
    __table_args__ = (UniqueConstraint("campaign_id", "contact_id"),)

    campaign_id: Mapped[str | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    automation_id: Mapped[str | None] = mapped_column(
        ForeignKey("automations.id", ondelete="SET NULL"), index=True
    )
    contact_id: Mapped[str | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="SET NULL"), index=True
    )
    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    status: Mapped[MessageStatus] = mapped_column(
        str_enum(MessageStatus), default=MessageStatus.QUEUED, index=True, nullable=False
    )
    provider_message_id: Mapped[str | None] = mapped_column(String(255), index=True)
    error: Mapped[str | None] = mapped_column(Text)
    bounce_type: Mapped[str | None] = mapped_column(String(16))

    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    first_opened_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    first_clicked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    bounced_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    open_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    click_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class EmailStatDaily(UUIDMixin, Base):
    """Pre-aggregated counters per day (and campaign) so analytics never scans messages."""

    __tablename__ = "email_stats_daily"
    __table_args__ = (UniqueConstraint("day", "campaign_id", name="uq_email_stats_daily_day"),)

    day: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    # Not a FK: "" buckets non-campaign mail, and history survives campaign deletion.
    campaign_id: Mapped[str] = mapped_column(String(36), default="", index=True, nullable=False)
    sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delivered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bounces: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unsubscribes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
