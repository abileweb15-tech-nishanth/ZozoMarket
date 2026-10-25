from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UTCDateTime, UUIDMixin, WorkspaceMixin, str_enum


class AutomationStatus(StrEnum):
    ACTIVE = "Active"
    PAUSED = "Paused"
    DRAFT = "Draft"
    ARCHIVED = "Archived"


class TriggerType(StrEnum):
    CONTACT_SUBSCRIBED = "contact_subscribed"
    TAG_ADDED = "tag_added"
    FORM_SUBMITTED = "form_submitted"
    ORDER_COMPLETED = "order_completed"
    CART_ABANDONED = "cart_abandoned"
    FORM_ABANDONED = "form_abandoned"
    INACTIVITY = "inactivity"
    MANUAL = "manual"


class NodeKind(StrEnum):
    TRIGGER = "Trigger"
    DELAY = "Delay"
    CONDITION = "Condition"
    EMAIL = "Email"
    ADD_TAG = "Add tag"
    REMOVE_TAG = "Remove tag"
    GOAL = "Goal"
    END = "End"


class EnrollmentStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    EXITED = "exited"
    FAILED = "failed"


class Automation(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "automations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    # Human-readable trigger description shown in the UI ("Contact subscribes").
    trigger: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    trigger_type: Mapped[TriggerType] = mapped_column(
        str_enum(TriggerType), default=TriggerType.MANUAL, index=True, nullable=False
    )
    # e.g. {"tag": "VIP"} for tag_added, {"formId": "..."} for form_submitted.
    trigger_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    audience: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    status: Mapped[AutomationStatus] = mapped_column(
        str_enum(AutomationStatus), default=AutomationStatus.DRAFT, index=True, nullable=False
    )
    # Canvas nodes: {"id", "kind", "label", "config", "position"}.
    nodes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    # {"id", "source", "target", "source_handle"} links. Empty means a straight line of nodes.
    edges: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    # Frozen copy used by new enrollments. Running enrollments keep their own copy.
    published_nodes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    published_edges: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    enrolled_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    emails_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AutomationEnrollment(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    __tablename__ = "automation_enrollments"
    __table_args__ = (UniqueConstraint("automation_id", "contact_id"),)

    automation_id: Mapped[str] = mapped_column(
        ForeignKey("automations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    contact_id: Mapped[str] = mapped_column(
        ForeignKey("contacts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[EnrollmentStatus] = mapped_column(
        str_enum(EnrollmentStatus), default=EnrollmentStatus.ACTIVE, index=True, nullable=False
    )
    current_step: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_node_id: Mapped[str | None] = mapped_column(String(64))
    next_run_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), index=True)
    last_message_id: Mapped[str | None] = mapped_column(String(36))
    context: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class AutomationStep(UUIDMixin, WorkspaceMixin, TimestampMixin, Base):
    """One recorded action inside an enrollment."""

    __tablename__ = "automation_steps"

    automation_id: Mapped[str] = mapped_column(
        ForeignKey("automations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    enrollment_id: Mapped[str] = mapped_column(
        ForeignKey("automation_enrollments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    node_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[str] = mapped_column(String(500), default="", nullable=False)
