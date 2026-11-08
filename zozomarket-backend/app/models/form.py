from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin, WorkspaceMixin, str_enum


class FormKind(StrEnum):
    SIGNUP = "Signup Forms"
    LANDING = "Landing Pages"
    EMBEDDED = "Embedded Forms"
    POPUP = "Popup Forms"


class FormStatus(StrEnum):
    LIVE = "Live"
    DRAFT = "Draft"
    PAUSED = "Paused"


class Form(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "forms"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    kind: Mapped[FormKind] = mapped_column(
        str_enum(FormKind), default=FormKind.SIGNUP, index=True, nullable=False
    )
    status: Mapped[FormStatus] = mapped_column(
        str_enum(FormStatus), default=FormStatus.DRAFT, nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    success_message: Mapped[str] = mapped_column(
        String(500), default="Thanks for subscribing!", nullable=False
    )
    redirect_url: Mapped[str | None] = mapped_column(String(500))
    # Extra fields beyond email/name: [{"name","label","type","required"}]
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    double_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    submissions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    @property
    def conversion_rate(self) -> float | None:
        return round(self.submissions * 100 / self.views, 1) if self.views else None


class FormSubmissionRecord(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "form_submissions"

    form_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("forms.id", ondelete="CASCADE"), index=True, nullable=False
    )
    contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="SET NULL"), index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(500))
