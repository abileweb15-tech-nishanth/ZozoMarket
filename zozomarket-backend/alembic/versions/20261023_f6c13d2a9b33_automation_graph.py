"""automation graph, published copy, and step log

Revision ID: f6c13d2a9b33
Revises: d5b02c1f8e22
Create Date: 2026-10-23 15:50:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6c13d2a9b33"
down_revision: str | None = "d5b02c1f8e22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "automations",
        sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
    )
    op.add_column("automations", sa.Column("edges", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column(
        "automations",
        sa.Column("published_nodes", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "automations",
        sa.Column("published_edges", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "automations",
        sa.Column("emails_sent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "automation_enrollments",
        sa.Column("current_node_id", sa.String(length=64), nullable=True),
    )
    op.create_table(
        "automation_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("automation_id", sa.String(length=36), nullable=False),
        sa.Column("enrollment_id", sa.String(length=36), nullable=False),
        sa.Column("node_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("result", sa.String(length=500), nullable=False),
        sa.ForeignKeyConstraint(
            ["automation_id"], ["automations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["enrollment_id"], ["automation_enrollments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_automation_steps_automation_id", "automation_steps", ["automation_id"])
    op.create_index("ix_automation_steps_enrollment_id", "automation_steps", ["enrollment_id"])
    op.create_index("ix_automation_steps_workspace_id", "automation_steps", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_automation_steps_workspace_id", table_name="automation_steps")
    op.drop_index("ix_automation_steps_enrollment_id", table_name="automation_steps")
    op.drop_index("ix_automation_steps_automation_id", table_name="automation_steps")
    op.drop_table("automation_steps")
    op.drop_column("automation_enrollments", "current_node_id")
    op.drop_column("automations", "emails_sent")
    op.drop_column("automations", "published_edges")
    op.drop_column("automations", "published_nodes")
    op.drop_column("automations", "edges")
    op.drop_column("automations", "description")
