"""Drip sequences: CRUD, trigger matching, enrollment and step execution.

A workflow is a linear list of nodes. Each enrollment holds a cursor (`current_step`) and a
`next_run_at`; the scheduler claims due enrollments with a short lease (conditional UPDATE)
so several workers can process concurrently without double-sending.
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
from app.models.automation import (
    Automation,
    AutomationEnrollment,
    AutomationStatus,
    EnrollmentStatus,
    NodeKind,
    TriggerType,
)
from app.models.base import utcnow
from app.models.contact import Contact, SubscriptionStatus
from app.models.message import EmailMessage
from app.models.template import EmailTemplate
from app.schemas.automation import AutomationCreate, AutomationUpdate, FlowNode
from app.services import analytics_service, email_service
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
        out.append(data)
    if out and out[-1]["kind"] != NodeKind.END.value:
        out.append(
            {"id": uuid.uuid4().hex[:12], "kind": "End", "label": "End workflow", "config": {}}
        )
    return out


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


def validate_for_activation(automation: Automation) -> None:
    nodes = automation.nodes or []
    if not nodes or nodes[0].get("kind") != NodeKind.TRIGGER.value:
        raise InvalidStateError("Workflow must start with a Trigger node")
    emails = [n for n in nodes if n.get("kind") == NodeKind.EMAIL.value]
    if not emails:
        raise InvalidStateError("Workflow must contain at least one Email step")
    problems = [p for n in emails if (p := _email_node_problems(n))]
    if problems:
        raise InvalidStateError("Workflow has incomplete email steps", details=problems)


# --- CRUD ---------------------------------------------------------------------------------


async def list_automations(
    session: AsyncSession,
    *,
    q: str | None,
    status: AutomationStatus | None,
    offset: int,
    limit: int,
) -> tuple[list[Automation], int]:
    stmt = select(Automation)
    if q:
        stmt = stmt.where(ilike(Automation.name, q))
    if status:
        stmt = stmt.where(Automation.status == status)
    return await paginate(
        session, stmt.order_by(Automation.updated_at.desc()), offset=offset, limit=limit
    )


async def get_automation(session: AsyncSession, automation_id: str) -> Automation:
    automation = await session.get(Automation, automation_id)
    if automation is None:
        raise NotFoundError(f"Automation {automation_id} not found")
    return automation


async def create_automation(session: AsyncSession, data: AutomationCreate) -> Automation:
    nodes = data.nodes or [FlowNode(kind=NodeKind.TRIGGER, label=data.trigger or "Trigger")]
    automation = Automation(
        name=data.name,
        trigger=data.trigger,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        audience=data.audience,
        status=AutomationStatus.DRAFT,
        nodes=normalize_nodes(nodes),
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
    for key, value in changes.items():
        if value is not None:
            setattr(automation, key, value)
    if automation.status is AutomationStatus.ACTIVE:
        validate_for_activation(automation)
    automation.updated_at = utcnow()
    await session.commit()
    return automation


async def set_status(
    session: AsyncSession, automation_id: str, status: AutomationStatus
) -> Automation:
    automation = await get_automation(session, automation_id)
    if status is AutomationStatus.ACTIVE:
        validate_for_activation(automation)
    automation.status = status
    automation.updated_at = utcnow()
    await session.commit()
    return automation


async def delete_automation(session: AsyncSession, automation_id: str) -> None:
    automation = await get_automation(session, automation_id)
    await session.delete(automation)
    await session.commit()


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
    count = 0
    for contact_id in eligible:
        try:
            async with session.begin_nested():
                session.add(
                    AutomationEnrollment(
                        workspace_id=automation.workspace_id,
                        automation_id=automation.id,
                        contact_id=contact_id,
                        next_run_at=now,
                        context=dict(context or {}),
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


async def advance(session: AsyncSession, enrollment: AutomationEnrollment) -> None:
    """Execute nodes from the cursor until a Delay, the End, or an exit. Caller commits."""
    automation = await session.get(Automation, enrollment.automation_id)
    contact = await session.get(Contact, enrollment.contact_id)
    if automation is None or contact is None:
        await _finish(session, enrollment, EnrollmentStatus.EXITED)
        return
    nodes = automation.nodes or []
    for _ in range(len(nodes) + 1):  # hard bound against malformed workflows
        if enrollment.current_step >= len(nodes):
            await _finish(session, enrollment, EnrollmentStatus.COMPLETED)
            return
        node = nodes[enrollment.current_step]
        kind = node.get("kind")
        if kind == NodeKind.END.value:
            await _finish(session, enrollment, EnrollmentStatus.COMPLETED)
            return
        if contact.status is not SubscriptionStatus.SUBSCRIBED:
            await _finish(session, enrollment, EnrollmentStatus.EXITED)
            return
        if kind == NodeKind.DELAY.value:
            enrollment.current_step += 1
            enrollment.next_run_at = utcnow() + dt.timedelta(seconds=delay_seconds(node))
            return
        if kind == NodeKind.EMAIL.value:
            message = await _send_node_email(session, automation, node, contact)
            enrollment.last_message_id = message.id
            enrollment.current_step += 1
            continue
        if kind == NodeKind.CONDITION.value:
            if await _evaluate_condition(session, node, enrollment, contact):
                enrollment.current_step += 1
            elif (node.get("config") or {}).get("onFalse") == "skip":
                enrollment.current_step += 2
            else:
                await _finish(session, enrollment, EnrollmentStatus.EXITED)
                return
            continue
        enrollment.current_step += 1  # Trigger / unknown nodes are pass-through
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


async def enrollment_stats(session: AsyncSession, automation_id: str) -> dict[str, int]:
    rows = await session.execute(
        select(AutomationEnrollment.status, func.count())
        .where(AutomationEnrollment.automation_id == automation_id)
        .group_by(AutomationEnrollment.status)
    )
    return {status.value: count for status, count in rows.all()}
