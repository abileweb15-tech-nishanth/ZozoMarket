"""workspace profile, brand, and sending defaults

Revision ID: d5b02c1f8e22
Revises: c4a91b0e7d11
Create Date: 2026-10-17 10:40:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5b02c1f8e22"
down_revision: str | None = "c4a91b0e7d11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("website", sa.String(length=500), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"),
    )
    op.add_column(
        "workspaces",
        sa.Column("mailing_address", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "workspaces",
        sa.Column("brand_color", sa.String(length=32), nullable=False, server_default="#f59e0b"),
    )
    op.add_column(
        "workspaces",
        sa.Column("font", sa.String(length=64), nullable=False, server_default="Inter"),
    )
    op.add_column("workspaces", sa.Column("logo_url", sa.String(length=1000), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column("from_name", sa.String(length=120), nullable=False, server_default=""),
    )
    op.add_column("workspaces", sa.Column("from_email", sa.String(length=320), nullable=True))
    op.add_column("workspaces", sa.Column("reply_to", sa.String(length=320), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column("track_opens", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "workspaces",
        sa.Column("track_clicks", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    for column in (
        "track_clicks",
        "track_opens",
        "reply_to",
        "from_email",
        "from_name",
        "logo_url",
        "font",
        "brand_color",
        "mailing_address",
        "timezone",
        "website",
    ):
        op.drop_column("workspaces", column)
