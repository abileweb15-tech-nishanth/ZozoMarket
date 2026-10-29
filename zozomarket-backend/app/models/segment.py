from typing import Any
from sqlalchemy import JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin, WorkspaceMixin


class Segment(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "segments"
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    match_type: Mapped[str] = mapped_column(String(20), default="any", nullable=False)
    status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
