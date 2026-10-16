from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field, model_validator

from app.models.automation import Automation, AutomationStatus, NodeKind, TriggerType
from app.schemas.common import CamelModel, InputModel


class FlowNode(CamelModel):
    id: str | None = Field(default=None, max_length=64)
    kind: NodeKind
    label: str = Field(default="", max_length=300)
    # Delay: {"amount": 2, "unit": "days"}
    # Email: {"subject": "...", "html": "...", "templateId": "..."}
    # Condition: {"type": "opened_previous" | "clicked_previous" | "has_tag", "tag": "...",
    #             "onFalse": "exit" | "continue"}
    config: dict[str, Any] = Field(default_factory=dict)


def _validate_nodes(nodes: list[FlowNode] | None) -> None:
    if not nodes:
        return
    if nodes[0].kind is not NodeKind.TRIGGER:
        raise ValueError("The first node must be a Trigger")
    if sum(1 for n in nodes if n.kind is NodeKind.TRIGGER) > 1:
        raise ValueError("Only one Trigger node is allowed")
    if any(n.kind is NodeKind.END for n in nodes[:-1]):
        raise ValueError("End node must be the last node")


class AutomationCreate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    trigger: str = Field(default="", max_length=200)
    trigger_type: TriggerType = TriggerType.MANUAL
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    audience: str = Field(default="", max_length=120)
    nodes: list[FlowNode] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _check(self) -> "AutomationCreate":
        _validate_nodes(self.nodes)
        return self


class AutomationUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    trigger: str | None = Field(default=None, max_length=200)
    trigger_type: TriggerType | None = None
    trigger_config: dict[str, Any] | None = None
    audience: str | None = Field(default=None, max_length=120)
    nodes: list[FlowNode] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def _check(self) -> "AutomationUpdate":
        _validate_nodes(self.nodes)
        return self


class AutomationRead(CamelModel):
    id: str
    name: str
    trigger: str
    trigger_type: TriggerType
    trigger_config: dict[str, Any]
    audience: str
    status: AutomationStatus
    updated: datetime
    nodes: list[FlowNode]
    enrolled_count: int
    completed_count: int
    created_at: datetime

    @classmethod
    def from_model(cls, a: Automation) -> "AutomationRead":
        return cls(
            id=a.id,
            name=a.name,
            trigger=a.trigger,
            trigger_type=a.trigger_type,
            trigger_config=a.trigger_config or {},
            audience=a.audience,
            status=a.status,
            updated=a.updated_at,
            nodes=[FlowNode.model_validate(n) for n in a.nodes or []],
            enrolled_count=a.enrolled_count,
            completed_count=a.completed_count,
            created_at=a.created_at,
        )


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
