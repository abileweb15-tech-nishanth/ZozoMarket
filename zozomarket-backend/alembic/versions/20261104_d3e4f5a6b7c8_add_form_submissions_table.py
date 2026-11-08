"""create form_submissions table

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-11-04 17:35:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.models.base

revision: str = "d3e4f5a6b7c8"
down_revision: str | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "form_submissions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("form_id", sa.String(length=36), nullable=False),
        sa.Column("contact_id", sa.String(length=36), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", app.models.base.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", app.models.base.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_form_submissions_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["form_id"],
            ["forms.id"],
            name=op.f("fk_form_submissions_form_id_forms"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["contact_id"],
            ["contacts.id"],
            name=op.f("fk_form_submissions_contact_id_contacts"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_form_submissions")),
    )
    op.create_index(op.f("ix_form_submissions_workspace_id"), "form_submissions", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_form_submissions_form_id"), "form_submissions", ["form_id"], unique=False)
    op.create_index(op.f("ix_form_submissions_contact_id"), "form_submissions", ["contact_id"], unique=False)
    op.create_index(op.f("ix_form_submissions_email"), "form_submissions", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_form_submissions_email"), table_name="form_submissions")
    op.drop_index(op.f("ix_form_submissions_contact_id"), table_name="form_submissions")
    op.drop_index(op.f("ix_form_submissions_form_id"), table_name="form_submissions")
    op.drop_index(op.f("ix_form_submissions_workspace_id"), table_name="form_submissions")
    op.drop_table("form_submissions")

