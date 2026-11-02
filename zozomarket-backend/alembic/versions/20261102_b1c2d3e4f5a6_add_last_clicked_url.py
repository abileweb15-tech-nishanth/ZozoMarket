"""add last_clicked_url to email_messages

Revision ID: b1c2d3e4f5a6
Revises: e3a9c7b1d2e4
Create Date: 2026-11-02 19:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "e3a9c7b1d2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("email_messages", sa.Column("last_clicked_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("email_messages", "last_clicked_url")
