"""Campaign CRUD, send lifecycle, recipient calculation, dispatch and calendar queries.

Lifecycle:   Draft ⇄ Scheduled → Sending → Sent
                                    ↘ Failed → (retry) → Sending

Transitions into `Sending` go through `claim()`, a conditional UPDATE, so only one worker
can ever own a dispatch. Dispatch itself is idempotent: one `EmailMessage` per
(campaign, contact) enforced by a unique constraint, so retries resume where they stopped.
"""

import asyncio
import datetime as dt
import logging
from collections.abc import Sequence

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, InvalidStateError, NotFoundError
from app.models.base import utcnow
from app.models.campaign import EDITABLE_STATUSES, Campaign, CampaignStatus, CampaignType
from app.models.contact import Contact
from app.models.message import EmailMessage, MessageStatus
from app.models.template import EmailTemplate
from app.schemas.campaign import CampaignCreate, CampaignUpdate
from app.services import analytics_service, contact_service, email_service
from app.services.query import ilike, paginate
from app.services.template_service import (
    SAMPLE_VARIABLES,
    ensure_preheader,
    render_blocks,
    render_merge_tags,
)

logger = logging.getLogger(__name__)

STALE_SENDING_AFTER = dt.timedelta(minutes=15)
SEND_CONCURRENCY = 10
_effective_at = func.coalesce(
    Campaign.sent_at, Campaign.started_at, Campaign.scheduled_at, Campaign.created_at
)


# --- Queries -------------------------------------------------------------------------


async def list_campaigns(
    session: AsyncSession,
    *,
    q: str | None,
    status: CampaignStatus | None,
    type_: CampaignType | None,
    offset: int,
    limit: int,
) -> tuple[list[Campaign], int]:
    stmt = select(Campaign)
    if q:
        stmt = stmt.where(ilike(Campaign.name, q))
    if status:
        stmt = stmt.where(Campaign.status == status)
    if type_:
        stmt = stmt.where(Campaign.type == type_)
    stmt = stmt.order_by(_effective_at.desc(), Campaign.id)
    return await paginate(session, stmt, offset=offset, limit=limit)


async def get_campaign(session: AsyncSession, campaign_id: str) -> Campaign:
    campaign = await session.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} not found")
    return campaign


async def status_counts(session: AsyncSession) -> dict[str, int]:
    rows = await session.execute(select(Campaign.status, func.count()).group_by(Campaign.status))
    counts = {s.value: 0 for s in CampaignStatus}
    counts.update({status.value: count for status, count in rows.all()})
    return counts


# --- CRUD -------------------------------------------------------------------------------


async def _apply_template(session: AsyncSession, campaign: Campaign, template_id: str) -> None:
    template = await session.get(EmailTemplate, template_id)
    if template is None:
        raise NotFoundError(f"Template {template_id} not found")
    campaign.template_id = template.id
    if not campaign.html:
        campaign.html = template.html or render_blocks(template.design or [], template.preheader)
    if not campaign.design:
        campaign.design = list(template.design or [])
    campaign.subject = campaign.subject or template.subject
    campaign.preheader = campaign.preheader or template.preheader


def _sync_html(campaign: Campaign, html_explicit: bool) -> None:
    if campaign.design and not html_explicit:
        campaign.html = render_blocks(campaign.design, campaign.preheader)


def _assert_sendable(campaign: Campaign) -> None:
    problems = []
    if not campaign.subject.strip():
        problems.append("subject is required")
    if not campaign.html.strip():
        problems.append("email content (html, design or template) is required")
    if problems:
        raise AppError(
            "Campaign is not ready to send", code="campaign_incomplete", details=problems
        )


async def create_campaign(session: AsyncSession, data: CampaignCreate) -> Campaign:
    values = data.model_dump(exclude={"scheduled_at", "template_id"}, exclude_none=True)
    campaign = Campaign(**values)
    campaign.subject = campaign.subject or ""
    campaign.preheader = campaign.preheader or ""
    campaign.html = campaign.html or ""
    campaign.design = campaign.design or []
    campaign.audience_tags = list(dict.fromkeys(data.audience_tags))
    _sync_html(campaign, html_explicit=bool(data.html))
    if data.template_id:
        await _apply_template(session, campaign, data.template_id)
    campaign.recipients = await contact_service.count_segment(session, campaign.audience_tags)
    if data.scheduled_at:
        _validate_schedule_time(data.scheduled_at)
        _assert_sendable(campaign)
        campaign.status = CampaignStatus.SCHEDULED
        campaign.scheduled_at = data.scheduled_at
    session.add(campaign)
    await session.commit()
    return campaign


async def update_campaign(
    session: AsyncSession, campaign_id: str, data: CampaignUpdate
) -> Campaign:
    campaign = await get_campaign(session, campaign_id)
    if campaign.status not in EDITABLE_STATUSES:
        raise InvalidStateError(f"Cannot edit a campaign in status {campaign.status.value}")
    changes = data.model_dump(exclude_unset=True)
    template_id = changes.pop("template_id", None)
    for key, value in changes.items():
        if value is not None:
            setattr(campaign, key, value)
    if "design" in changes or "preheader" in changes:
        _sync_html(campaign, html_explicit="html" in changes)
    if template_id:
        await _apply_template(session, campaign, template_id)
    if "audience_tags" in changes:
        campaign.recipients = await contact_service.count_segment(session, campaign.audience_tags)
    if campaign.status is CampaignStatus.SCHEDULED:
        _assert_sendable(campaign)
    campaign.updated_at = utcnow()
    await session.commit()
    return campaign


async def delete_campaign(session: AsyncSession, campaign_id: str) -> None:
    campaign = await get_campaign(session, campaign_id)
    if campaign.status is CampaignStatus.SENDING:
        raise InvalidStateError("Cannot delete a campaign while it is sending")
    await session.delete(campaign)
    await session.commit()


async def duplicate_campaign(session: AsyncSession, campaign_id: str) -> Campaign:
    src = await get_campaign(session, campaign_id)
    copy = Campaign(
        name=f"{src.name} (copy)"[:200],
        type=src.type,
        audience=src.audience,
        audience_tags=list(src.audience_tags or []),
        subject=src.subject,
        preheader=src.preheader,
        from_name=src.from_name,
        from_email=src.from_email,
        reply_to=src.reply_to,
        template_id=src.template_id,
        html=src.html,
        design=list(src.design or []),
        recipients=await contact_service.count_segment(session, src.audience_tags),
    )
    session.add(copy)
    await session.commit()
    return copy


# --- Lifecycle ----------------------------------------------------------------------------


def _validate_schedule_time(at: dt.datetime) -> None:
    if at < utcnow() - dt.timedelta(minutes=1):
        raise AppError("scheduledAt must be in the future", code="invalid_schedule")


async def schedule(session: AsyncSession, campaign_id: str, at: dt.datetime) -> Campaign:
    campaign = await get_campaign(session, campaign_id)
    if campaign.status not in EDITABLE_STATUSES:
        raise InvalidStateError(f"Cannot schedule a campaign in status {campaign.status.value}")
    _validate_schedule_time(at)
    _assert_sendable(campaign)
    campaign.status = CampaignStatus.SCHEDULED
    campaign.scheduled_at = at
    campaign.recipients = await contact_service.count_segment(session, campaign.audience_tags)
    await session.commit()
    return campaign


async def unschedule(session: AsyncSession, campaign_id: str) -> Campaign:
    campaign = await get_campaign(session, campaign_id)
    if campaign.status is not CampaignStatus.SCHEDULED:
        raise InvalidStateError("Only scheduled campaigns can be unscheduled")
    campaign.status = CampaignStatus.DRAFT
    campaign.scheduled_at = None
    await session.commit()
    return campaign


async def claim(
    session: AsyncSession, campaign_id: str, from_statuses: Sequence[CampaignStatus]
) -> bool:
    """Atomically move a campaign into Sending. Returns False if someone else won the race."""
    now = utcnow()
    result = await session.execute(
        update(Campaign)
        .where(Campaign.id == campaign_id, Campaign.status.in_(list(from_statuses)))
        .values(status=CampaignStatus.SENDING, started_at=now, failure_reason=None, updated_at=now)
    )
    await session.commit()
    return bool(result.rowcount)


async def start_send(session: AsyncSession, campaign_id: str) -> Campaign:
    """Validate and claim a campaign for immediate sending; caller enqueues the dispatch."""
    campaign = await get_campaign(session, campaign_id)
    if campaign.status not in (*EDITABLE_STATUSES, CampaignStatus.FAILED):
        raise InvalidStateError(f"Cannot send a campaign in status {campaign.status.value}")
    _assert_sendable(campaign)
    if not await claim(session, campaign_id, [*EDITABLE_STATUSES, CampaignStatus.FAILED]):
        raise InvalidStateError("Campaign is already being sent")
    await session.refresh(campaign)
    return campaign


async def claim_due(session: AsyncSession, *, limit: int = 20) -> list[str]:
    """Claim scheduled campaigns whose time has come, plus stalled dispatches to resume."""
    now = utcnow()
    due = list(
        await session.scalars(
            select(Campaign.id)
            .where(Campaign.status == CampaignStatus.SCHEDULED, Campaign.scheduled_at <= now)
            .order_by(Campaign.scheduled_at)
            .limit(limit)
        )
    )
    claimed = [cid for cid in due if await claim(session, cid, [CampaignStatus.SCHEDULED])]
    stale = list(
        await session.scalars(
            select(Campaign.id).where(
                Campaign.status == CampaignStatus.SENDING,
                Campaign.updated_at < now - STALE_SENDING_AFTER,
            )
        )
    )
    for cid in stale:
        result = await session.execute(
            update(Campaign)
            .where(
                Campaign.id == cid,
                Campaign.status == CampaignStatus.SENDING,
                Campaign.updated_at < now - STALE_SENDING_AFTER,
            )
            .values(updated_at=now)
        )
        if result.rowcount:
            logger.warning("Resuming stalled dispatch for campaign %s", cid)
            claimed.append(cid)
    await session.commit()
    return claimed


# --- Dispatch -------------------------------------------------------------------------------


async def _send_one(
    campaign: Campaign, message_id: str, contact: Contact, sem: asyncio.Semaphore
) -> tuple[str, str | None, email_service.EmailDeliveryError | None]:
    body, subject, headers = email_service.personalise(
        html=ensure_preheader(campaign.html, campaign.preheader),
        subject=campaign.subject,
        contact_id=contact.id,
        name=contact.name,
        email=contact.email,
        attributes=contact.attributes,
        message_id=message_id,
    )
    email = email_service.OutboundEmail(
        to=contact.email,
        subject=subject,
        html=body,
        headers=headers,
        from_email=campaign.from_email or settings.EMAIL_FROM_ADDRESS,
        from_name=campaign.from_name or settings.EMAIL_FROM_NAME,
        reply_to=campaign.reply_to,
    )
    async with sem:
        try:
            result = await email_service.send_email(email)
            return message_id, result.provider_message_id, None
        except email_service.EmailDeliveryError as exc:
            return message_id, None, exc
        except Exception as exc:  # provider bug / unexpected — record as transient failure
            logger.exception("Unexpected send error for message %s", message_id)
            return message_id, None, email_service.EmailDeliveryError(str(exc))


async def run_dispatch(session: AsyncSession, campaign_id: str) -> None:
    campaign = await session.get(Campaign, campaign_id)
    if campaign is None or campaign.status is not CampaignStatus.SENDING:
        return
    logger.info("Dispatching campaign %s (%s)", campaign.id, campaign.name)
    sem = asyncio.Semaphore(SEND_CONCURRENCY)
    already_sent = select(EmailMessage.contact_id).where(
        EmailMessage.campaign_id == campaign.id,
        EmailMessage.contact_id.is_not(None),
        EmailMessage.status != MessageStatus.FAILED,
    )
    try:
        last_id = ""
        while True:
            contacts = list(
                await session.scalars(
                    contact_service.segment_query(campaign.audience_tags)
                    .where(Contact.id > last_id, Contact.id.not_in(already_sent))
                    .order_by(Contact.id)
                    .limit(settings.SEND_BATCH_SIZE)
                )
            )
            if not contacts:
                break
            last_id = contacts[-1].id

            # Transient failures from an earlier attempt are retried in place.
            retryable = {
                m.contact_id: m
                for m in await session.scalars(
                    select(EmailMessage).where(
                        EmailMessage.campaign_id == campaign.id,
                        EmailMessage.contact_id.in_([c.id for c in contacts]),
                        EmailMessage.status == MessageStatus.FAILED,
                    )
                )
            }
            messages: dict[str, tuple[EmailMessage, Contact]] = {}
            for contact in contacts:
                if contact.id in retryable:
                    message = retryable[contact.id]
                    message.status, message.error = MessageStatus.QUEUED, None
                    messages[message.id] = (message, contact)
                    continue
                try:
                    async with session.begin_nested():
                        message = EmailMessage(
                            campaign_id=campaign.id,
                            contact_id=contact.id,
                            to_email=contact.email,
                            subject=campaign.subject,
                        )
                        session.add(message)
                    messages[message.id] = (message, contact)
                except IntegrityError:
                    continue  # another worker already handled this recipient
            await session.commit()

            results = await asyncio.gather(
                *(_send_one(campaign, mid, c, sem) for mid, (_, c) in messages.items())
            )
            for message_id, provider_id, error in results:
                message = messages[message_id][0]
                if error is None:
                    await analytics_service.record_sent(session, message, provider_id or "")
                else:
                    await analytics_service.record_failure(
                        session, message, str(error), permanent=error.permanent
                    )
            await session.commit()

        totals = await session.execute(
            select(EmailMessage.status, func.count())
            .where(EmailMessage.campaign_id == campaign.id)
            .group_by(EmailMessage.status)
        )
        by_status = {s: c for s, c in totals.all()}
        total = sum(by_status.values())
        failed = by_status.get(MessageStatus.FAILED, 0)
        await session.refresh(campaign)
        campaign.recipients = total
        if total and failed == total:
            campaign.status = CampaignStatus.FAILED
            campaign.failure_reason = "All deliveries failed; check email provider settings"
        else:
            campaign.status = CampaignStatus.SENT
            campaign.failure_reason = f"{failed} of {total} deliveries failed" if failed else None
        campaign.sent_at = utcnow()
        await session.commit()
        logger.info("Campaign %s finished: %s", campaign.id, by_status)
    except Exception as exc:
        logger.exception("Dispatch of campaign %s crashed", campaign_id)
        await session.rollback()
        await session.execute(
            update(Campaign)
            .where(Campaign.id == campaign_id)
            .values(status=CampaignStatus.FAILED, failure_reason=f"Dispatch error: {exc}"[:2000])
        )
        await session.commit()


async def send_test(session: AsyncSession, campaign_id: str, emails: Sequence[str]) -> int:
    campaign = await get_campaign(session, campaign_id)
    _assert_sendable(campaign)
    variables = dict(SAMPLE_VARIABLES)
    html = render_merge_tags(ensure_preheader(campaign.html, campaign.preheader), variables)
    subject = "[Test] " + render_merge_tags(campaign.subject, variables, escape=False)
    for to in emails:
        await email_service.send_email(
            email_service.OutboundEmail(
                to=str(to),
                subject=subject,
                html=html,
                reply_to=campaign.reply_to,
                from_email=campaign.from_email or settings.EMAIL_FROM_ADDRESS,
                from_name=campaign.from_name or settings.EMAIL_FROM_NAME,
            )
        )
    return len(emails)


# --- Calendar -------------------------------------------------------------------------------


async def calendar_campaigns(
    session: AsyncSession,
    *,
    start: dt.date,
    end: dt.date,
    type_: CampaignType | None = None,
    status: CampaignStatus | None = None,
    limit: int = 1000,
) -> list[Campaign]:
    start_dt = dt.datetime.combine(start, dt.time.min, tzinfo=dt.UTC)
    end_dt = dt.datetime.combine(end, dt.time.max, tzinfo=dt.UTC)
    stmt = select(Campaign).where(_effective_at >= start_dt, _effective_at <= end_dt)
    if type_:
        stmt = stmt.where(Campaign.type == type_)
    if status:
        stmt = stmt.where(Campaign.status == status)
    return list(await session.scalars(stmt.order_by(_effective_at).limit(limit)))


async def upcoming(session: AsyncSession, *, limit: int = 10) -> list[Campaign]:
    now = utcnow()
    stmt = (
        select(Campaign)
        .where(Campaign.status == CampaignStatus.SCHEDULED, Campaign.scheduled_at >= now)
        .order_by(Campaign.scheduled_at)
        .limit(limit)
    )
    return list(await session.scalars(stmt))
