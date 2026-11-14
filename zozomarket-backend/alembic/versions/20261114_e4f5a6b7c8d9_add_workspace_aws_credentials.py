"""add workspace aws credentials columns

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-11-14 15:20:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("aws_access_key_id", sa.Text(), nullable=True))
    op.add_column("workspaces", sa.Column("aws_secret_access_key", sa.Text(), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column("aws_region", sa.String(length=64), nullable=False, server_default="us-east-1"),
    )
    op.add_column(
        "workspaces",
        sa.Column(
            "aws_encryption_disabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "aws_encryption_disabled")
    op.drop_column("workspaces", "aws_region")
    op.drop_column("workspaces", "aws_secret_access_key")
    op.drop_column("workspaces", "aws_access_key_id")
