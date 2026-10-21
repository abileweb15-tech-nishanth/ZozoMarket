"""accounts and workspace ownership

Revision ID: c4a91b0e7d11
Revises: e23f82e9d224
Create Date: 2026-10-16 17:40:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4a91b0e7d11"
down_revision: str | None = "e23f82e9d224"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OWNED = (
    "automations",
    "automation_enrollments",
    "campaigns",
    "contacts",
    "email_messages",
    "email_stats_daily",
    "email_templates",
    "forms",
    "media_assets",
    "tags",
)


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspaces")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_users_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_workspace_id"), "users", ["workspace_id"], unique=False)
    op.create_foreign_key(
        "fk_workspaces_owner_id_users",
        "workspaces",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="SET NULL",
    )

    for table in _OWNED:
        op.add_column(table, sa.Column("workspace_id", sa.String(length=36), nullable=False))
        op.create_index(op.f(f"ix_{table}_workspace_id"), table, ["workspace_id"], unique=False)
        op.create_foreign_key(
            op.f(f"fk_{table}_workspace_id_workspaces"),
            table,
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.drop_index(op.f("ix_contacts_email"), table_name="contacts")
    op.create_index(op.f("ix_contacts_email"), "contacts", ["email"], unique=False)
    op.create_unique_constraint("uq_contacts_workspace_id", "contacts", ["workspace_id", "email"])

    op.drop_constraint(op.f("uq_tags_name"), "tags", type_="unique")
    op.create_unique_constraint("uq_tags_workspace_id", "tags", ["workspace_id", "name"])

    op.drop_constraint("uq_email_stats_daily_day", "email_stats_daily", type_="unique")
    op.create_unique_constraint(
        "uq_email_stats_daily_workspace_day",
        "email_stats_daily",
        ["workspace_id", "day", "campaign_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_email_stats_daily_workspace_day", "email_stats_daily", type_="unique")
    op.create_unique_constraint(
        "uq_email_stats_daily_day", "email_stats_daily", ["day", "campaign_id"]
    )
    op.drop_constraint("uq_tags_workspace_id", "tags", type_="unique")
    op.create_unique_constraint(op.f("uq_tags_name"), "tags", ["name"])
    op.drop_constraint("uq_contacts_workspace_id", "contacts", type_="unique")
    op.drop_index(op.f("ix_contacts_email"), table_name="contacts")
    op.create_index(op.f("ix_contacts_email"), "contacts", ["email"], unique=True)

    for table in reversed(_OWNED):
        op.drop_constraint(
            op.f(f"fk_{table}_workspace_id_workspaces"), table, type_="foreignkey"
        )
        op.drop_index(op.f(f"ix_{table}_workspace_id"), table_name=table)
        op.drop_column(table, "workspace_id")

    op.drop_constraint("fk_workspaces_owner_id_users", "workspaces", type_="foreignkey")
    op.drop_index(op.f("ix_users_workspace_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_table("workspaces")
