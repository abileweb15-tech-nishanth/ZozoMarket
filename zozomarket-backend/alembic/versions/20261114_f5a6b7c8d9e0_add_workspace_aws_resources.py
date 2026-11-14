"""add workspace ses_configuration_set and sqs_queue_url

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-11-14 15:51:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: str | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("ses_configuration_set", sa.String(length=200), nullable=True))
    op.add_column("workspaces", sa.Column("sqs_queue_url", sa.String(length=1000), nullable=True))
    op.add_column("workspaces", sa.Column("s3_bucket_name", sa.String(length=255), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column("aws_s3_media_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "aws_s3_media_enabled")
    op.drop_column("workspaces", "s3_bucket_name")
    op.drop_column("workspaces", "sqs_queue_url")
    op.drop_column("workspaces", "ses_configuration_set")
