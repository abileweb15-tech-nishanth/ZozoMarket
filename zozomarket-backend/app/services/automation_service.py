"""Drip sequences: CRUD, trigger matching, enrollment and step execution.

A workflow is a graph of nodes and edges. Each enrollment stores the graph it started with
and a `current_node_id`. Delays set `next_run_at`; the scheduler claims due rows with a
short lease so a restart continues the same step without sending twice.
"""

import datetime as dt
import html as html_lib
import logging
import re
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidStateError, NotFoundError
from app.core.tenancy import workspace_scope
from app.models.automation import (
    Automation,
    AutomationEnrollment,
    AutomationStatus,
    AutomationStep,
    EnrollmentStatus,
    NodeKind,
    TriggerType,
)
from app.models.base import utcnow
from app.models.contact import Contact, SubscriptionStatus
from app.models.message import EmailMessage
from app.models.template import EmailTemplate
from app.schemas.automation import AutomationCreate, AutomationUpdate, FlowEdge, FlowNode
from app.services import analytics_service, contact_service, email_service
from app.services.query import ilike, paginate
from app.services.template_service import template_html

logger = logging.getLogger(__name__)

LEASE = dt.timedelta(minutes=5)
_DELAY_RE = re.compile(r"(\d+)\s*(minute|min|hour|hr|day|week)s?", re.IGNORECASE)
_UNIT_SECONDS = {"minute": 60, "min": 60, "hour": 3600, "hr": 3600, "day": 86400, "week": 604800}


# --- Node helpers --------------------------------------------------------------------


def normalize_nodes(nodes: Sequence[FlowNode | dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for node in nodes:
        data = node.model_dump() if isinstance(node, FlowNode) else dict(node)
        data["id"] = data.get("id") or uuid.uuid4().hex[:12]
        data["kind"] = NodeKind(data["kind"]).value
        data.setdefault("label", "")
        data.setdefault("config", {})
        data.setdefault("position", {"x": 0, "y": 0})
        out.append(data)
    return out


def normalize_edges(edges: Sequence[FlowEdge | dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for edge in edges:
        data = edge.model_dump() if isinstance(edge, FlowEdge) else dict(edge)
        data["id"] = data.get("id") or uuid.uuid4().hex[:12]
        handle = data.get("source_handle") or data.get("sourceHandle")
        data["source_handle"] = handle or None
        data.pop("sourceHandle", None)
        out.append(data)
    return out


def linear_edges(nodes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """A saved workflow with no edges still runs top to bottom."""
    edges = []
    for source, target in zip(nodes, nodes[1:]):
        edges.append(
            {
                "id": f"{source['id']}-{target['id']}",
                "source": source["id"],
                "target": target["id"],
                "source_handle": None,
            }
        )
    return edges


def delay_seconds(node: dict[str, Any]) -> int:
    config = node.get("config") or {}
    if "amount" in config:
        unit = str(config.get("unit", "days")).rstrip("s").lower()
        return int(config["amount"]) * _UNIT_SECONDS.get(unit, 86400)
    match = _DELAY_RE.search(node.get("label", ""))
    if match:
        return int(match.group(1)) * _UNIT_SECONDS[match.group(2).lower()]
    return 86400


def _email_node_problems(node: dict[str, Any]) -> str | None:
    config = node.get("config") or {}
    if config.get("templateId"):
        return None
    if not config.get("subject"):
        return f"Email step '{node.get('label')}' needs a subject (config.subject)"
    if not (config.get("html") or config.get("body")):
        return f"Email step '{node.get('label')}' needs content (config.html or templateId)"
    return None


def graph_problems(automation: Automation) -> list[dict[str, str | None]]:
    nodes = automation.nodes or []
    edges = automation.edges or []
    problems: list[dict[str, str | None]] = []
    triggers = [n for n in nodes if n.get("kind") == NodeKind.TRIGGER.value]
    if len(triggers) != 1:
        problems.append({"node_id": None, "message": "The workflow needs exactly one trigger"})
    ids = {n.get("id") for n in nodes}
    if len(ids) != len(nodes) or None in ids:
        problems.append({"node_id": None, "message": "Every node needs its own id"})
    emails = [n for n in nodes if n.get("kind") == NodeKind.EMAIL.value]
    if not emails:
        problems.append({"node_id": None, "message": "Add at least one email step"})
    for node in emails:
        problem = _email_node_problems(node)
        if problem:
            problems.append({"node_id": node.get("id"), "message": problem})
    for node in nodes:
        if node.get("kind") != NodeKind.DELAY.value:
            continue
        amount = (node.get("config") or {}).get("amount")
        if not isinstance(amount, int | float) or amount <= 0:
            problems.append({"node_id": node.get("id"), "message": "A delay needs an amount greater than zero"})
        unit = str((node.get("config") or {}).get("unit", "")).rstrip("s").lower()
        if unit not in _UNIT_SECONDS:
            problems.append({"node_id": node.get("id"), "message": "A delay unit must be minutes, hours, or days"})
    for node in nodes:
        config = node.get("config") or {}
        needs_tag = node.get("kind") in (NodeKind.ADD_TAG.value, NodeKind.REMOVE_TAG.value) or (
            node.get("kind") == NodeKind.CONDITION.value and config.get("type") == "has_tag"
        )
        if needs_tag and not str(config.get("tag", "")).strip():
            problems.append({"node_id": node.get("id"), "message": f"Step '{node.get('label')}' needs a tag"})
    walking = edges or linear_edges(nodes)
    for edge in walking:
        if edge.get("source") not in ids or edge.get("target") not in ids:
            problems.append({"node_id": edge.get("source"), "message": "A connection points at a missing node"})
    if edges:
        for node in nodes:
            if node.get("kind") != NodeKind.CONDITION.value:
                continue
            handles = {e.get("source_handle") for e in edges if e.get("source") == node.get("id")}
            if "true" not in handles or "false" not in handles:
                problems.append(
                    {"node_id": node.get("id"), "message": "A condition needs a true path and a false path"}
                )
        if _has_cycle(nodes, edges):
            problems.append({"node_id": None, "message": "The workflow contains a loop"})
    return problems


def _has_cycle(nodes: Sequence[dict[str, Any]], edges: Sequence[dict[str, Any]]) -> bool:
    outgoing: dict[str, list[str]] = {n["id"]: [] for n in nodes if n.get("id")}
    for edge in edges:
        if edge.get("source") in outgoing and edge.get("target"):
            outgoing[edge["source"]].append(edge["target"])
    visiting: set[str] = set()
    visited: set[str] = set()

    def walk(node_id: str) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        if any(walk(child) for child in outgoing.get(node_id, [])):
            return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    return any(walk(node_id) for node_id in outgoing)


def validate_for_activation(automation: Automation) -> None:
    problems = graph_problems(automation)
    if problems:
        raise InvalidStateError(
            "Workflow is not ready to activate",
            details=[p["message"] for p in problems],
        )


# --- CRUD ---------------------------------------------------------------------------------


async def list_automations(
    session: AsyncSession,
    *,
    q: str | None,
    status: AutomationStatus | None,
    offset: int,
    limit: int,
    sort: str = "updated",
) -> tuple[list[Automation], int]:
    stmt = select(Automation)
    if q:
        stmt = stmt.where(ilike(Automation.name, q))
    if status:
        stmt = stmt.where(Automation.status == status)
    order = {
        "name": Automation.name,
        "created": Automation.created_at.desc(),
        "activity": Automation.enrolled_count.desc(),
    }.get(sort, Automation.updated_at.desc())
    return await paginate(session, stmt.order_by(order), offset=offset, limit=limit)


async def get_automation(session: AsyncSession, automation_id: str) -> Automation:
    automation = await session.get(Automation, automation_id)
    if automation is None:
        raise NotFoundError(f"Automation {automation_id} not found")
    return automation


def _publish(automation: Automation) -> None:
    automation.published_nodes = list(automation.nodes or [])
    automation.published_edges = list(automation.edges or [])


async def create_automation(session: AsyncSession, data: AutomationCreate) -> Automation:
    nodes = data.nodes or [FlowNode(kind=NodeKind.TRIGGER, label=data.trigger or "Trigger")]
    automation = Automation(
        name=data.name,
        description=data.description,
        trigger=data.trigger,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        audience=data.audience,
        status=AutomationStatus.DRAFT,
        nodes=normalize_nodes(nodes),
        edges=normalize_edges(data.edges),
    )
    session.add(automation)
    await session.commit()
    return automation


async def update_automation(
    session: AsyncSession, automation_id: str, data: AutomationUpdate
) -> Automation:
    automation = await get_automation(session, automation_id)
    changes = data.model_dump(exclude_unset=True)
    if "nodes" in changes:
        changes["nodes"] = normalize_nodes(data.nodes or [])
    if "edges" in changes:
        changes["edges"] = normalize_edges(data.edges or [])
    for key, value in changes.items():
        if value is not None:
            setattr(automation, key, value)
    if automation.status is AutomationStatus.ACTIVE:
        validate_for_activation(automation)
        _publish(automation)
    automation.updated_at = utcnow()
    await session.commit()
    return automation


async def set_status(
    session: AsyncSession, automation_id: str, status: AutomationStatus
) -> Automation:
    automation = await get_automation(session, automation_id)
    if status is AutomationStatus.ACTIVE:
        validate_for_activation(automation)
        _publish(automation)
    automation.status = status
    automation.updated_at = utcnow()
    await session.commit()
    return automation


async def delete_automation(session: AsyncSession, automation_id: str) -> None:
    automation = await get_automation(session, automation_id)
    await session.delete(automation)
    await session.commit()


async def duplicate_automation(session: AsyncSession, automation_id: str) -> Automation:
    src = await get_automation(session, automation_id)
    copy = Automation(
        name=f"{src.name} (copy)"[:200],
        description=src.description,
        trigger=src.trigger,
        trigger_type=src.trigger_type,
        trigger_config=dict(src.trigger_config or {}),
        audience=src.audience,
        status=AutomationStatus.DRAFT,
        nodes=list(src.nodes or []),
        edges=list(src.edges or []),
    )
    session.add(copy)
    await session.commit()
    return copy


# --- Enrollment -----------------------------------------------------------------------------


def _matches(automation: Automation, data: dict[str, Any]) -> bool:
    config = automation.trigger_config or {}
    if automation.trigger_type is TriggerType.TAG_ADDED and config.get("tag"):
        return str(config["tag"]).lower() == str(data.get("tag", "")).lower()
    if automation.trigger_type is TriggerType.FORM_SUBMITTED and config.get("formId"):
        return config["formId"] == data.get("formId")
    return True


async def enroll(
    session: AsyncSession,
    automation: Automation,
    contact_ids: Sequence[str],
    context: dict[str, Any] | None = None,
) -> int:
    """Enroll contacts (once per automation). Caller commits."""
    if automation.status is not AutomationStatus.ACTIVE:
        raise InvalidStateError("Only active automations accept enrollments")
    already = set(
        await session.scalars(
            select(AutomationEnrollment.contact_id).where(
                AutomationEnrollment.automation_id == automation.id,
                AutomationEnrollment.contact_id.in_(list(contact_ids)),
            )
        )
    )
    eligible = set(
        await session.scalars(
            select(Contact.id).where(
                Contact.id.in_([c for c in contact_ids if c not in already]),
                Contact.status == SubscriptionStatus.SUBSCRIBED,
            )
        )
    )
    now = utcnow()
    graph = {
        "nodes": list(automation.published_nodes or automation.nodes or []),
        "edges": list(automation.published_edges or automation.edges or []),
    }
    start = next((n.get("id") for n in graph["nodes"] if n.get("kind") == NodeKind.TRIGGER.value), None)
    if start is None and graph["nodes"]:
        start = graph["nodes"][0].get("id")
    count = 0
    for contact_id in eligible:
        try:
            async with session.begin_nested():
                session.add(
                    AutomationEnrollment(
                        workspace_id=automation.workspace_id,
                        automation_id=automation.id,
                        contact_id=contact_id,
                        current_node_id=start,
                        next_run_at=now,
                        context={**(context or {}), "graph": graph},
                    )
                )
            count += 1
        except IntegrityError:
            continue
    if count:
        await session.execute(
            update(Automation)
            .where(Automation.id == automation.id)
            .values(enrolled_count=Automation.enrolled_count + count)
        )
    return count


async def handle_event(
    session: AsyncSession,
    trigger: TriggerType,
    contact: Contact,
    data: dict[str, Any] | None = None,
) -> int:
    """Enroll `contact` into every active automation listening for `trigger`. Caller commits."""
    data = data or {}
    automations = await session.scalars(
        select(Automation).where(
            Automation.trigger_type == trigger, Automation.status == AutomationStatus.ACTIVE
        )
    )
    total = 0
    for automation in automations:
        if _matches(automation, data):
            total += await enroll(
                session, automation, [contact.id], {"event": trigger.value, **data}
            )
    return total


# --- Execution ------------------------------------------------------------------------------


async def _evaluate_condition(
    session: AsyncSession, node: dict[str, Any], enrollment: AutomationEnrollment, contact: Contact
) -> bool:
    config = node.get("config") or {}
    kind = config.get("type")
    label = node.get("label", "").lower()
    if not kind:
        kind = "clicked_previous" if "click" in label else "opened_previous"
    if kind == "has_tag":
        return str(config.get("tag", "")).lower() in {t.lower() for t in contact.tag_names}
    if not enrollment.last_message_id:
        return False
    message = await session.get(EmailMessage, enrollment.last_message_id)
    if message is None:
        return False
    if kind == "clicked_previous":
        return message.first_clicked_at is not None
    return message.first_opened_at is not None


async def _send_node_email(
    session: AsyncSession, automation: Automation, node: dict[str, Any], contact: Contact
) -> EmailMessage:
    config = node.get("config") or {}
    subject = config.get("subject") or ""
    html = config.get("html") or ""
    if not html and config.get("body"):
        paragraphs = str(config["body"]).split("\n\n")
        html = "".join(f"<p>{html_lib.escape(p).replace(chr(10), '<br>')}</p>" for p in paragraphs)
    if config.get("templateId"):
        template = await session.get(EmailTemplate, config["templateId"])
        if template is not None:
            html = html or template_html(template)
            subject = subject or template.subject
    message = EmailMessage(
        workspace_id=automation.workspace_id,
        automation_id=automation.id,
        contact_id=contact.id,
        to_email=contact.email,
        subject=subject or node.get("label", automation.name),
    )
    session.add(message)
    await session.flush()
    body, rendered_subject, headers = email_service.personalise(
        html=html,
        subject=message.subject,
        contact_id=contact.id,
        name=contact.name,
        email=contact.email,
        attributes=contact.attributes,
        message_id=message.id,
    )
    try:
        result = await email_service.send_email(
            email_service.OutboundEmail(
                to=contact.email, subject=rendered_subject, html=body, headers=headers
            )
        )
        await analytics_service.record_sent(session, message, result.provider_message_id)
    except email_service.EmailDeliveryError as exc:
        await analytics_service.record_failure(session, message, str(exc), permanent=exc.permanent)
    return message


async def _finish(
    session: AsyncSession, enrollment: AutomationEnrollment, status: EnrollmentStatus
) -> None:
    enrollment.status = status
    enrollment.next_run_at = None
    enrollment.completed_at = utcnow()
    if status is EnrollmentStatus.COMPLETED:
        await session.execute(
            update(Automation)
            .where(Automation.id == enrollment.automation_id)
            .values(completed_count=Automation.completed_count + 1)
        )


def _graph(
    enrollment: AutomationEnrollment, automation: Automation
) -> tuple[dict[str, dict], list[dict], bool]:
    stored = (enrollment.context or {}).get("graph") or {}
    nodes = stored.get("nodes") or automation.published_nodes or automation.nodes or []
    edges = stored.get("edges")
    if edges is None:
        edges = automation.published_edges or automation.edges or []
    explicit = bool(edges)
    by_id = {n["id"]: n for n in nodes if n.get("id")}
    return by_id, list(edges or []) or linear_edges(nodes), explicit


def _follow(edges: Sequence[dict[str, Any]], node_id: str, handle: str | None) -> str | None:
    matches = [e for e in edges if e.get("source") == node_id]
    if handle:
        for edge in matches:
            if edge.get("source_handle") == handle:
                return edge.get("target")
        return None
    for edge in matches:
        if not edge.get("source_handle"):
            return edge.get("target")
    return matches[0].get("target") if len(matches) == 1 else None


def _remember(enrollment: AutomationEnrollment, **values: Any) -> None:
    enrollment.context = {**(enrollment.context or {}), **values}


async def _log(
    session: AsyncSession, enrollment: AutomationEnrollment, node_id: str, action: str, result: str
) -> None:
    session.add(
        AutomationStep(
            workspace_id=enrollment.workspace_id,
            automation_id=enrollment.automation_id,
            enrollment_id=enrollment.id,
            node_id=node_id,
            action=action,
            result=result[:500],
        )
    )


async def _apply_tag(session: AsyncSession, contact: Contact, tag: str, *, remove: bool) -> str:
    name = tag.strip()
    if not name:
        return "No tag was configured"
    with workspace_scope(contact.workspace_id):
        return await _change_tag(session, contact, name, remove=remove)


async def _change_tag(session: AsyncSession, contact: Contact, name: str, *, remove: bool) -> str:
    if remove:
        before = len(contact.tags)
        contact.tags = [item for item in contact.tags if item.name.lower() != name.lower()]
        return f"Removed {name}" if len(contact.tags) < before else f"{name} was not on the contact"
    existing = {item.name.lower() for item in contact.tags}
    if name.lower() in existing:
        return f"{name} was already on the contact"
    contact.tags = [*contact.tags, *(await contact_service.get_or_create_tags(session, [name]))]
    return f"Added {name}"


async def advance(session: AsyncSession, enrollment: AutomationEnrollment) -> None:
    """Run from the current node until a delay, the end, or an exit. Caller commits."""
    automation = await session.get(Automation, enrollment.automation_id)
    contact = await session.get(Contact, enrollment.contact_id)
    if automation is None or contact is None or automation.status is not AutomationStatus.ACTIVE:
        await _finish(session, enrollment, EnrollmentStatus.EXITED)
        return
    by_id, edges, explicit = _graph(enrollment, automation)
    node_id = enrollment.current_node_id
    for _ in range(len(by_id) + 1):
        node = by_id.get(node_id or "")
        if node is None:
            await _finish(session, enrollment, EnrollmentStatus.COMPLETED)
            return
        kind = node.get("kind")
        if kind == NodeKind.END.value:
            await _log(session, enrollment, node["id"], "completed", "Workflow ended")
            await _finish(session, enrollment, EnrollmentStatus.COMPLETED)
            return
        if contact.status is not SubscriptionStatus.SUBSCRIBED and kind == NodeKind.EMAIL.value:
            await _log(session, enrollment, node["id"], "exited", "Contact is not subscribed")
            await _finish(session, enrollment, EnrollmentStatus.EXITED)
            return
        if kind == NodeKind.DELAY.value:
            waited = (enrollment.context or {}).get("delayDone")
            if waited == node["id"]:
                _remember(enrollment, delayDone=None)
                node_id = _follow(edges, node["id"], None)
                enrollment.current_node_id = node_id
                continue
            _remember(enrollment, delayDone=node["id"])
            enrollment.next_run_at = utcnow() + dt.timedelta(seconds=delay_seconds(node))
            await _log(session, enrollment, node["id"], "delayed", f"Wait until {enrollment.next_run_at.isoformat()}")
            return
        if kind == NodeKind.EMAIL.value:
            message = await _send_node_email(session, automation, node, contact)
            enrollment.last_message_id = message.id
            if message.status.value == "sent":
                await session.execute(
                    update(Automation)
                    .where(Automation.id == automation.id)
                    .values(emails_sent=Automation.emails_sent + 1)
                )
            await _log(session, enrollment, node["id"], "email", message.status.value)
        elif kind == NodeKind.CONDITION.value:
            passed = await _evaluate_condition(session, node, enrollment, contact)
            await _log(session, enrollment, node["id"], "condition", "true" if passed else "false")
            node_id = _follow(edges, node["id"], "true" if passed else "false")
            if node_id is None and not explicit:
                if passed:
                    node_id = _follow(edges, node["id"], None)
                else:
                    await _finish(session, enrollment, EnrollmentStatus.EXITED)
                    return
            enrollment.current_node_id = node_id
            enrollment.current_step += 1
            continue
        elif kind == NodeKind.ADD_TAG.value:
            result = await _apply_tag(session, contact, str((node.get("config") or {}).get("tag", "")), remove=False)
            await _log(session, enrollment, node["id"], "add_tag", result)
        elif kind == NodeKind.REMOVE_TAG.value:
            result = await _apply_tag(session, contact, str((node.get("config") or {}).get("tag", "")), remove=True)
            await _log(session, enrollment, node["id"], "remove_tag", result)
        elif kind == NodeKind.GOAL.value:
            await _log(session, enrollment, node["id"], "goal", node.get("label") or "Goal reached")
        else:
            await _log(session, enrollment, node["id"], "started", node.get("label") or kind or "")
        node_id = _follow(edges, node["id"], None)
        enrollment.current_node_id = node_id
        enrollment.current_step += 1
    await _log(session, enrollment, node_id or "", "failed", "The workflow did not finish")
    await _finish(session, enrollment, EnrollmentStatus.FAILED)


async def process_due_enrollments(session: AsyncSession, *, limit: int = 200) -> int:
    now = utcnow()
    candidates = list(
        await session.execute(
            select(AutomationEnrollment.id, AutomationEnrollment.next_run_at)
            .join(Automation, Automation.id == AutomationEnrollment.automation_id)
            .where(
                AutomationEnrollment.status == EnrollmentStatus.ACTIVE,
                AutomationEnrollment.next_run_at <= now,
                Automation.status == AutomationStatus.ACTIVE,
            )
            .order_by(AutomationEnrollment.next_run_at)
            .limit(limit)
        )
    )
    processed = 0
    for enrollment_id, run_at in candidates:
        claimed = await session.execute(
            update(AutomationEnrollment)
            .where(
                AutomationEnrollment.id == enrollment_id,
                AutomationEnrollment.next_run_at == run_at,
            )
            .values(next_run_at=now + LEASE)
        )
        await session.commit()
        if not claimed.rowcount:
            continue
        enrollment = await session.get(AutomationEnrollment, enrollment_id, populate_existing=True)
        if enrollment is None:
            continue
        try:
            await advance(session, enrollment)
            await session.commit()
            processed += 1
        except Exception:
            logger.exception("Automation step failed for enrollment %s", enrollment_id)
            await session.rollback()
    return processed


async def list_enrollments(
    session: AsyncSession, automation_id: str, *, offset: int, limit: int
) -> tuple[list[tuple[AutomationEnrollment, Contact | None]], int]:
    rows, total = await paginate(
        session,
        select(AutomationEnrollment)
        .where(AutomationEnrollment.automation_id == automation_id)
        .order_by(AutomationEnrollment.created_at.desc()),
        offset=offset,
        limit=limit,
    )
    ids = [row.contact_id for row in rows]
    contacts = {
        contact.id: contact
        for contact in await session.scalars(select(Contact).where(Contact.id.in_(ids)))
    } if ids else {}
    return [(row, contacts.get(row.contact_id)) for row in rows], total


async def list_steps(
    session: AsyncSession, automation_id: str, *, offset: int, limit: int
) -> tuple[list[AutomationStep], int]:
    stmt = (
        select(AutomationStep)
        .where(AutomationStep.automation_id == automation_id)
        .order_by(AutomationStep.created_at.desc())
    )
    return await paginate(session, stmt, offset=offset, limit=limit)


def first_email_in_flow(automation: Automation) -> dict[str, Any] | None:
    """The first Email node reached from the trigger, breadth first along the edges."""
    nodes = automation.nodes or []
    by_id = {n.get("id"): n for n in nodes}
    edges = automation.edges or linear_edges(nodes)
    start = next((n for n in nodes if n.get("kind") == NodeKind.TRIGGER.value), None)
    queue = [start["id"]] if start else [n.get("id") for n in nodes[:1]]
    seen: set[str] = set()
    while queue:
        node_id = queue.pop(0)
        if node_id in seen or node_id not in by_id:
            continue
        seen.add(node_id)
        node = by_id[node_id]
        if node.get("kind") == NodeKind.EMAIL.value:
            return node
        children = [e for e in edges if e.get("source") == node_id]
        children.sort(key=lambda e: 0 if e.get("source_handle") in (None, "", "true") else 1)
        queue.extend(e.get("target") for e in children)
    return None


async def send_test(
    session: AsyncSession, automation_id: str, email: str, node_id: str | None = None
) -> None:
    """Send one email step to one address. Does not enroll anyone."""
    automation = await get_automation(session, automation_id)
    if node_id:
        node = next((n for n in automation.nodes or [] if n.get("id") == node_id), None)
        if node is None or node.get("kind") != NodeKind.EMAIL.value:
            raise InvalidStateError("Save the draft, then pick an email step to test")
    else:
        node = first_email_in_flow(automation)
    if node is None or _email_node_problems(node):
        raise InvalidStateError("Add a subject and content or a template to this email step before sending a test")
    config = node.get("config") or {}
    html = config.get("html") or config.get("body") or ""
    subject = config.get("subject") or ""
    if config.get("templateId"):
        template = await session.get(EmailTemplate, config["templateId"])
        if template is None:
            raise InvalidStateError("The template on this email step no longer exists")
        html = html or template_html(template)
        subject = subject or template.subject
    message = EmailMessage(
        workspace_id=automation.workspace_id,
        automation_id=automation.id,
        to_email=email,
        subject=subject or node.get("label") or automation.name,
    )
    session.add(message)
    await session.flush()
    body, rendered_subject, headers = email_service.personalise(
        html=html,
        subject=message.subject,
        contact_id=message.id,
        name="Test",
        email=email,
        message_id=message.id,
    )
    try:
        result = await email_service.send_email(
            email_service.OutboundEmail(to=email, subject=f"[Test] {rendered_subject}", html=body, headers=headers)
        )
    except email_service.EmailDeliveryError as exc:
        await session.rollback()
        raise InvalidStateError(f"The test email was not sent: {exc}") from exc
    await analytics_service.record_sent(session, message, result.provider_message_id)
    await session.commit()


async def enrollment_stats(session: AsyncSession, automation_id: str) -> dict[str, int]:
    rows = await session.execute(
        select(AutomationEnrollment.status, func.count())
        .where(AutomationEnrollment.automation_id == automation_id)
        .group_by(AutomationEnrollment.status)
    )
    return {status.value: count for status, count in rows.all()}
