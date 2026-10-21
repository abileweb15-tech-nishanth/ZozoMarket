"""A person who can sign in, and the one workspace that owns their data."""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Workspace(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    website: Mapped[str | None] = mapped_column(String(500))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    mailing_address: Mapped[str] = mapped_column(Text, default="", nullable=False)
    brand_color: Mapped[str] = mapped_column(String(32), default="#f59e0b", nullable=False)
    font: Mapped[str] = mapped_column(String(64), default="Inter", nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1000))
    from_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    from_email: Mapped[str | None] = mapped_column(String(320))
    reply_to: Mapped[str | None] = mapped_column(String(320))
    track_opens: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    track_clicks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_workspaces_owner_id_users",
        )
    )


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )

    workspace: Mapped[Workspace] = relationship(
        foreign_keys=[workspace_id], lazy="selectin"
    )
