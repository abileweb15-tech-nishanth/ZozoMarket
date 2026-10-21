from typing import Any

from sqlalchemy import JSON, Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin, WorkspaceMixin


class EmailTemplate(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "email_templates"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(64), index=True, default="General", nullable=False)
    image: Mapped[str | None] = mapped_column(String(500))  # thumbnail URL
    subject: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    preheader: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    html: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Visual builder blocks; when present, `html` is regenerated from them on save.
    design: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
