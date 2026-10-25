from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field, model_validator

from app.models.automation import Automation, AutomationStatus, EnrollmentStatus, NodeKind, TriggerType
from app.schemas.common import CamelModel, InputModel


class FlowNode(CamelModel):
    id: str | None = Field(default=None, max_length=64)
    kind: NodeKind
    label: str = Field(default="", max_length=300)
    # Delay: {"amount": 2, "unit": "minutes"|"hours"|"days"}
    # Email: {"subject": "...", "html": "...", "templateId": "..."}
    # Condition: {"type": "opened_previous"|"clicked_previous"|"has_tag", "tag": "..."}
    # Tag nodes: {"tag": "..."}
    config: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})


class FlowEdge(CamelModel):
    id: str | None = Field(default=None, max_length=64)
    source: str = Field(max_length=64)
    target: str = Field(max_length=64)
    # "true" / "false" on a condition. Empty means the single path out of a node.
    source_handle: str | None = Field(default=None, max_length=32)


def _validate_nodes(nodes: list[FlowNode] | None) -> None:
    if not nodes:
        return
    if sum(1 for n in nodes if n.kind is NodeKind.TRIGGER) > 1:
        raise ValueError("Only one Trigger node is allowed")


class AutomationCreate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=500)
    trigger: str = Field(default="", max_length=200)
    trigger_type: TriggerType = TriggerType.MANUAL
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    audience: str = Field(default="", max_length=120)
    nodes: list[FlowNode] = Field(default_factory=list, max_length=100)
    edges: list[FlowEdge] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _check(self) -> "AutomationCreate":
        _validate_nodes(self.nodes)
        return self


class AutomationUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    trigger: str | None = Field(default=None, max_length=200)
    trigger_type: TriggerType | None = None
    trigger_config: dict[str, Any] | None = None
    audience: str | None = Field(default=None, max_length=120)
    nodes: list[FlowNode] | None = Field(default=None, max_length=100)
    edges: list[FlowEdge] | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _check(self) -> "AutomationUpdate":
        _validate_nodes(self.nodes)
        return self


class AutomationRead(CamelModel):
    id: str
    name: str
    description: str
    trigger: str
    trigger_type: TriggerType
    trigger_config: dict[str, Any]
    audience: str
    status: AutomationStatus
    updated: datetime
    nodes: list[FlowNode]
    edges: list[FlowEdge]
    enrolled_count: int
    completed_count: int
    emails_sent: int
    created_at: datetime

    @classmethod
    def from_model(cls, a: Automation) -> "AutomationRead":
        return cls(
            id=a.id,
            name=a.name,
            description=a.description or "",
            trigger=a.trigger,
            trigger_type=a.trigger_type,
            trigger_config=a.trigger_config or {},
            audience=a.audience,
            status=a.status,
            updated=a.updated_at,
            nodes=[FlowNode.model_validate(n) for n in a.nodes or []],
            edges=[FlowEdge.model_validate(e) for e in a.edges or []],
            enrolled_count=a.enrolled_count,
            completed_count=a.completed_count,
            emails_sent=a.emails_sent,
            created_at=a.created_at,
        )


class WorkflowProblem(CamelModel):
    node_id: str | None = None
    message: str


class WorkflowValidation(CamelModel):
    ok: bool
    problems: list[WorkflowProblem]


class EnrollmentRead(CamelModel):
    id: str
    contact_id: str
    contact_name: str
    contact_email: str
    status: EnrollmentStatus
    current_node_id: str | None
    next_run_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class StepRead(CamelModel):
    id: str
    enrollment_id: str
    node_id: str
    action: str
    result: str
    created_at: datetime


class TestSendRequest(InputModel):
    email: EmailStr
    node_id: str | None = Field(default=None, max_length=64)


class EnrollRequest(InputModel):
    contact_ids: list[str] = Field(min_length=1, max_length=5000)


class TriggerEventRequest(InputModel):
    """External event (e.g. from a store integration) that may start automations."""

    event: TriggerType
    email: EmailStr
    name: str | None = Field(default=None, max_length=200)
    data: dict[str, Any] = Field(default_factory=dict)


class EnrollmentResult(CamelModel):
    enrolled: int
