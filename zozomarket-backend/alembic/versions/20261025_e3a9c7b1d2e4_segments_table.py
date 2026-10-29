"""segments table

Revision ID: e3a9c7b1d2e4
Revises: f6c13d2a9b33
Create Date: 2026-10-25 11:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.models.base

revision: str = "e3a9c7b1d2e4"
down_revision: str | None = "f6c13d2a9b33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "segments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", app.models.base.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", app.models.base.UTCDateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("match_type", sa.String(length=20), nullable=False, server_default="any"),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_segments_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_segments")),
        sa.UniqueConstraint("workspace_id", "name", name="uq_segments_workspace_id_name"),
    )
    op.create_index(op.f("ix_segments_workspace_id"), "segments", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_segments_workspace_id"), table_name="segments")
    op.drop_table("segments")
