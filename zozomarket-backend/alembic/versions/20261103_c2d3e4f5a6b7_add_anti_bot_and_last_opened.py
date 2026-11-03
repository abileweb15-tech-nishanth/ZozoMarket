"""add anti-bot and last_opened tracking columns to email_messages

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-11-03 15:15:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.models.base

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("email_messages", sa.Column("bot_scan_at", app.models.base.UTCDateTime(timezone=True), nullable=True))
    op.add_column("email_messages", sa.Column("last_bot_scan_at", app.models.base.UTCDateTime(timezone=True), nullable=True))
    op.add_column("email_messages", sa.Column("last_opened_at", app.models.base.UTCDateTime(timezone=True), nullable=True))
    op.add_column(
        "email_messages",
        sa.Column("is_bot_suspected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("email_messages", "is_bot_suspected")
    op.drop_column("email_messages", "last_opened_at")
    op.drop_column("email_messages", "last_bot_scan_at")
    op.drop_column("email_messages", "bot_scan_at")
