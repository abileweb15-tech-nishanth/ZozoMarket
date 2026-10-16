"""Delivery event recording and analytics aggregation.

Counters are incremented with `SET col = col + n` and first-open/first-click detection uses
conditional UPDATEs, so concurrent tracking hits never double count.
"""

import datetime as dt
from typing import Literal

from sqlalchemy import and_, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import Automation, AutomationStatus
from app.models.base import utcnow
from app.models.campaign import Campaign, CampaignStatus
from app.models.contact import Contact, SubscriptionStatus
from app.models.message import EmailMessage, EmailStatDaily, MessageStatus

_STAT_COLUMNS = ("sent", "delivered", "opens", "clicks", "bounces", "unsubscribes")
_CAMPAIGN_COUNTER = {
    "sent": "sent_count",
    "delivered": "delivered_count",
    "opens": "opened_count",
    "clicks": "clicked_count",
    "bounces": "bounced_count",
    "unsubscribes": "unsubscribed_count",
}


def _pct(part: float, whole: float) -> float | None:
    return round(part * 100 / whole, 1) if whole else None


# --- Counter primitives -----------------------------------------------------------


async def bump_stats(
    session: AsyncSession,
    campaign_id: str | None,
    *,
    day: dt.date | None = None,
    **increments: int,
) -> None:
    """Increment daily aggregate counters and, for campaign mail, the campaign counters."""
    increments = {k: v for k, v in increments.items() if v}
    if not increments:
        return
    unknown = set(increments) - set(_STAT_COLUMNS)
    if unknown:
        raise ValueError(f"Unknown stat columns: {unknown}")
    day = day or utcnow().date()
    key = campaign_id or ""

    exists = await session.scalar(
        select(EmailStatDaily.id).where(
            EmailStatDaily.day == day, EmailStatDaily.campaign_id == key
        )
    )
    if exists is None:
        try:
            async with session.begin_nested():
                session.add(EmailStatDaily(day=day, campaign_id=key))
        except IntegrityError:
            pass  # created concurrently; fall through to the UPDATE
    await session.execute(
        update(EmailStatDaily)
        .where(EmailStatDaily.day == day, EmailStatDaily.campaign_id == key)
        .values({c: getattr(EmailStatDaily, c) + n for c, n in increments.items()})
    )
    if campaign_id:
        await session.execute(
            update(Campaign)
            .where(Campaign.id == campaign_id)
            .values(
                {
                    _CAMPAIGN_COUNTER[c]: getattr(Campaign, _CAMPAIGN_COUNTER[c]) + n
                    for c, n in increments.items()
                }
            )
        )


# --- Event recording ----------------------------------------------------------------


async def record_sent(session: AsyncSession, message: EmailMessage, provider_id: str) -> None:
    now = utcnow()
    message.status = MessageStatus.DELIVERED
    message.provider_message_id = provider_id
    message.sent_at = message.delivered_at = now
    # Providers without delivery webhooks are treated as delivered on acceptance; a later
    # bounce webhook reverses this (see record_bounce).
    await bump_stats(session, message.campaign_id, sent=1, delivered=1)


async def record_failure(
    session: AsyncSession, message: EmailMessage, error: str, *, permanent: bool
) -> None:
    now = utcnow()
    message.error = error[:2000]
    if permanent:
        message.status = MessageStatus.BOUNCED
        message.bounce_type = "hard"
        message.bounced_at = now
        await bump_stats(session, message.campaign_id, sent=1, bounces=1)
    else:
        message.status = MessageStatus.FAILED


async def record_bounce(
    session: AsyncSession, message: EmailMessage, *, bounce_type: str, reason: str | None
) -> None:
    if message.status is MessageStatus.BOUNCED:
        return
    was_delivered = message.status is MessageStatus.DELIVERED
    message.status = MessageStatus.BOUNCED
    message.bounce_type = bounce_type
    message.bounced_at = utcnow()
    message.error = (reason or "")[:2000] or None
    await bump_stats(session, message.campaign_id, bounces=1, delivered=-1 if was_delivered else 0)
    if bounce_type == "hard" and message.contact_id:
        # Protect sender reputation: stop mailing hard-bounced addresses.
        await session.execute(
            update(Contact)
            .where(Contact.id == message.contact_id)
            .values(status=SubscriptionStatus.UNSUBSCRIBED, unsubscribed_at=utcnow())
        )


async def record_open(session: AsyncSession, message_id: str) -> bool:
    """Returns True if this was the first (unique) open."""
    now = utcnow()
    await session.execute(
        update(EmailMessage)
        .where(EmailMessage.id == message_id)
        .values(open_count=EmailMessage.open_count + 1)
    )
    first = await session.execute(
        update(EmailMessage)
        .where(
            EmailMessage.id == message_id,
            EmailMessage.first_opened_at.is_(None),
            EmailMessage.status != MessageStatus.BOUNCED,
        )
        .values(first_opened_at=now)
    )
    if first.rowcount:
        campaign_id = await session.scalar(
            select(EmailMessage.campaign_id).where(EmailMessage.id == message_id)
        )
        await bump_stats(session, campaign_id, opens=1)
    await session.commit()
    return bool(first.rowcount)


async def record_click(session: AsyncSession, message_id: str) -> None:
    now = utcnow()
    await session.execute(
        update(EmailMessage)
        .where(EmailMessage.id == message_id)
        .values(click_count=EmailMessage.click_count + 1)
    )
    first = await session.execute(
        update(EmailMessage)
        .where(EmailMessage.id == message_id, EmailMessage.first_clicked_at.is_(None))
        .values(first_clicked_at=now)
    )
    if first.rowcount:
        campaign_id = await session.scalar(
            select(EmailMessage.campaign_id).where(EmailMessage.id == message_id)
        )
        await bump_stats(session, campaign_id, clicks=1)
        await session.commit()
        # A click proves the email was opened even if the tracking pixel was blocked.
        await record_open(session, message_id)
        return
    await session.commit()


async def record_unsubscribe(
    session: AsyncSession, contact_id: str, message_id: str | None = None
) -> bool:
    contact = await session.get(Contact, contact_id)
    if contact is None:
        return False
    if contact.status is not SubscriptionStatus.UNSUBSCRIBED:
        contact.status = SubscriptionStatus.UNSUBSCRIBED
        contact.unsubscribed_at = utcnow()
        campaign_id = None
        if message_id:
            campaign_id = await session.scalar(
                select(EmailMessage.campaign_id).where(EmailMessage.id == message_id)
            )
        await bump_stats(session, campaign_id, unsubscribes=1)
    await session.commit()
    return True


# --- Queries ----------------------------------------------------------------------------


async def _daily_totals(
    session: AsyncSession, start: dt.date, end: dt.date, campaign_id: str | None = None
) -> dict[dt.date, dict[str, int]]:
    stmt = (
        select(EmailStatDaily.day, *[func.sum(getattr(EmailStatDaily, c)) for c in _STAT_COLUMNS])
        .where(EmailStatDaily.day >= start, EmailStatDaily.day <= end)
        .group_by(EmailStatDaily.day)
    )
    if campaign_id is not None:
        stmt = stmt.where(EmailStatDaily.campaign_id == campaign_id)
    result: dict[dt.date, dict[str, int]] = {}
    for row in (await session.execute(stmt)).all():
        result[row[0]] = {c: int(v or 0) for c, v in zip(_STAT_COLUMNS, row[1:], strict=True)}
    return result


def _sum(days: dict[dt.date, dict[str, int]]) -> dict[str, int]:
    totals = dict.fromkeys(_STAT_COLUMNS, 0)
    for counters in days.values():
        for c, v in counters.items():
            totals[c] += v
    return totals


async def overview(session: AsyncSession, start: dt.date, end: dt.date) -> dict:
    t = _sum(await _daily_totals(session, start, end))
    return {
        "start": start,
        "end": end,
        **t,
        "delivery_rate": _pct(t["delivered"], t["sent"]),
        "open_rate": _pct(t["opens"], t["delivered"]),
        "click_rate": _pct(t["clicks"], t["delivered"]),
        "click_to_open_rate": _pct(t["clicks"], t["opens"]),
        "bounce_rate": _pct(t["bounces"], t["sent"]),
        "unsubscribe_rate": _pct(t["unsubscribes"], t["delivered"]),
    }


async def performance_series(
    session: AsyncSession,
    start: dt.date,
    end: dt.date,
    interval: Literal["day", "week", "month"] = "week",
    campaign_id: str | None = None,
) -> list[dict]:
    """Time series bucketed in Python from the (small) per-day aggregate rows; works the same
    on SQLite and PostgreSQL. Weeks start on Monday."""
    days = await _daily_totals(session, start, end, campaign_id)

    def bucket(d: dt.date) -> dt.date:
        if interval == "day":
            return d
        if interval == "month":
            return d.replace(day=1)
        return d - dt.timedelta(days=d.weekday())

    buckets: dict[dt.date, dict[str, int]] = {}
    cursor = bucket(start)
    while cursor <= end:
        buckets[cursor] = dict.fromkeys(_STAT_COLUMNS, 0)
        if interval == "day":
            cursor += dt.timedelta(days=1)
        elif interval == "week":
            cursor += dt.timedelta(days=7)
        else:
            cursor = (cursor.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    for day, counters in days.items():
        target = buckets.setdefault(bucket(day), dict.fromkeys(_STAT_COLUMNS, 0))
        for c, v in counters.items():
            target[c] += v

    label_fmt = "%b %Y" if interval == "month" else "%b {d}"
    return [
        {
            "week": period.strftime(label_fmt).replace("{d}", str(period.day)),
            "period_start": period,
            **counters,
        }
        for period, counters in sorted(buckets.items())
    ]


async def campaign_performance(session: AsyncSession, limit: int = 50) -> list[Campaign]:
    rows = await session.scalars(
        select(Campaign)
        .where(Campaign.sent_count > 0)
        .order_by(func.coalesce(Campaign.sent_at, Campaign.started_at, Campaign.created_at).desc())
        .limit(limit)
    )
    return list(rows)


async def deliverability(session: AsyncSession, start: dt.date, end: dt.date) -> dict:
    t = _sum(await _daily_totals(session, start, end))
    start_dt = dt.datetime.combine(start, dt.time.min, tzinfo=dt.UTC)
    end_dt = dt.datetime.combine(end, dt.time.max, tzinfo=dt.UTC)
    in_range = and_(EmailMessage.created_at >= start_dt, EmailMessage.created_at <= end_dt)
    bounce_rows = await session.execute(
        select(EmailMessage.bounce_type, func.count())
        .where(in_range, EmailMessage.status == MessageStatus.BOUNCED)
        .group_by(EmailMessage.bounce_type)
    )
    by_type = {k or "hard": v for k, v in bounce_rows.all()}
    failed = await session.scalar(
        select(func.count()).where(in_range, EmailMessage.status == MessageStatus.FAILED)
    )
    unsubscribed = await session.scalar(
        select(func.count()).where(Contact.status == SubscriptionStatus.UNSUBSCRIBED)
    )
    return {
        "sent": t["sent"],
        "delivered": t["delivered"],
        "bounced": t["bounces"],
        "hard_bounces": by_type.get("hard", 0),
        "soft_bounces": by_type.get("soft", 0),
        "failed": failed or 0,
        "delivery_rate": _pct(t["delivered"], t["sent"]),
        "bounce_rate": _pct(t["bounces"], t["sent"]),
        "unsubscribed_contacts": unsubscribed or 0,
    }


# --- Dashboard KPIs ---------------------------------------------------------------------


def _trend(current: float, previous: float) -> float:
    if not previous:
        return 0.0 if not current else 100.0
    return round((current - previous) * 100 / previous, 1)


def _kpi(raw: float, display: str, trend: float) -> dict:
    return {"value": display, "raw": raw, "trend": trend}


async def dashboard_kpis(session: AsyncSession, window_days: int = 30) -> dict:
    today = utcnow().date()
    cur_start = today - dt.timedelta(days=window_days - 1)
    prev_end = cur_start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=window_days - 1)
    cur = _sum(await _daily_totals(session, cur_start, today))
    prev = _sum(await _daily_totals(session, prev_start, prev_end))

    def rate(t: dict[str, int], num: str, den: str) -> float:
        return _pct(t[num], t[den]) or 0.0

    window_start = dt.datetime.combine(cur_start, dt.time.min, tzinfo=dt.UTC)
    subscribed = (
        await session.scalar(
            select(func.count()).where(Contact.status == SubscriptionStatus.SUBSCRIBED)
        )
        or 0
    )
    subscribed_before = (
        await session.scalar(
            select(func.count()).where(
                Contact.status == SubscriptionStatus.SUBSCRIBED, Contact.created_at < window_start
            )
        )
        or 0
    )
    scheduled = (
        await session.scalar(
            select(func.count()).where(Campaign.status == CampaignStatus.SCHEDULED)
        )
        or 0
    )
    scheduled_new = (
        await session.scalar(
            select(func.count()).where(
                Campaign.status == CampaignStatus.SCHEDULED, Campaign.updated_at >= window_start
            )
        )
        or 0
    )
    active = (
        await session.scalar(
            select(func.count()).where(Automation.status == AutomationStatus.ACTIVE)
        )
        or 0
    )
    active_new = (
        await session.scalar(
            select(func.count()).where(
                Automation.status == AutomationStatus.ACTIVE, Automation.updated_at >= window_start
            )
        )
        or 0
    )

    rates = {
        "delivery_rate": ("delivered", "sent"),
        "email_open_rate": ("opens", "delivered"),
        "avg_click_rate": ("clicks", "delivered"),
    }
    kpis = {
        "emails_delivered": _kpi(
            cur["delivered"], f"{cur['delivered']:,}", _trend(cur["delivered"], prev["delivered"])
        ),
        "total_subscribers": _kpi(
            subscribed, f"{subscribed:,}", _trend(subscribed, subscribed_before)
        ),
        "scheduled_campaigns": _kpi(scheduled, str(scheduled), float(scheduled_new)),
        "active_automations": _kpi(active, str(active), float(active_new)),
    }
    for key, (num, den) in rates.items():
        value = rate(cur, num, den)
        kpis[key] = _kpi(value, f"{value:.1f}%", round(value - rate(prev, num, den), 1))
    return kpis
