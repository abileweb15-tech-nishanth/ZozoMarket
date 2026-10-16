"""Audience CRM: contacts, tags, bulk operations, segmentation and CSV import/export."""

import csv
import io
from collections.abc import AsyncIterator, Iterable, Sequence
from typing import Any, Literal

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import Select, delete, func, insert, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.automation import TriggerType
from app.models.base import utcnow
from app.models.contact import Contact, SubscriptionStatus, Tag, contact_tags
from app.schemas.contact import ContactCreate, ContactUpdate
from app.services import automation_service
from app.services.query import ilike, paginate

SortField = Literal["added", "-added", "name", "-name", "email", "-email"]
_SORTS = {
    "added": Contact.created_at.asc(),
    "-added": Contact.created_at.desc(),
    "name": Contact.name.asc(),
    "-name": Contact.name.desc(),
    "email": Contact.email.asc(),
    "-email": Contact.email.desc(),
}
CSV_COLUMNS = ["email", "name", "tags", "status", "source", "added"]
MAX_IMPORT_ROWS = 100_000


def normalize_email(email: str) -> str:
    return email.strip().lower()


# --- Tags -------------------------------------------------------------------------


async def get_or_create_tags(session: AsyncSession, names: Iterable[str]) -> list[Tag]:
    wanted = list(dict.fromkeys(n.strip()[:64] for n in names if n and n.strip()))
    if not wanted:
        return []
    existing = {t.name: t for t in await session.scalars(select(Tag).where(Tag.name.in_(wanted)))}
    for name in wanted:
        if name in existing:
            continue
        try:
            async with session.begin_nested():
                tag = Tag(name=name)
                session.add(tag)
            existing[name] = tag
        except IntegrityError:
            existing[name] = (await session.scalars(select(Tag).where(Tag.name == name))).one()
    return [existing[n] for n in wanted]


async def tag_counts(session: AsyncSession) -> list[tuple[str, int]]:
    rows = await session.execute(
        select(Tag.name, func.count(contact_tags.c.contact_id))
        .outerjoin(contact_tags, contact_tags.c.tag_id == Tag.id)
        .group_by(Tag.name)
        .order_by(func.count(contact_tags.c.contact_id).desc(), Tag.name)
    )
    return [(name, count) for name, count in rows.all()]


# --- Queries -----------------------------------------------------------------------


def _has_any_tag(tags: Sequence[str]) -> Any:
    return Contact.id.in_(
        select(contact_tags.c.contact_id)
        .join(Tag, Tag.id == contact_tags.c.tag_id)
        .where(Tag.name.in_(list(tags)))
    )


def filtered_query(
    *,
    q: str | None = None,
    status: SubscriptionStatus | None = None,
    tag: str | None = None,
    source: str | None = None,
) -> Select[tuple[Contact]]:
    stmt = select(Contact)
    if q:
        stmt = stmt.where(or_(ilike(Contact.name, q), ilike(Contact.email, q)))
    if status:
        stmt = stmt.where(Contact.status == status)
    if tag:
        stmt = stmt.where(_has_any_tag([tag]))
    if source:
        stmt = stmt.where(Contact.source == source)
    return stmt


def segment_query(tags: Sequence[str] | None) -> Select[tuple[Contact]]:
    """Subscribed contacts matching ANY of `tags` (all subscribed contacts if no tags)."""
    stmt = select(Contact).where(Contact.status == SubscriptionStatus.SUBSCRIBED)
    if tags:
        stmt = stmt.where(_has_any_tag(tags))
    return stmt


async def count_segment(session: AsyncSession, tags: Sequence[str] | None) -> int:
    stmt = segment_query(tags).with_only_columns(func.count(Contact.id))
    return await session.scalar(stmt) or 0


async def list_contacts(
    session: AsyncSession,
    *,
    q: str | None,
    status: SubscriptionStatus | None,
    tag: str | None,
    source: str | None,
    sort: SortField,
    offset: int,
    limit: int,
) -> tuple[list[Contact], int]:
    stmt = filtered_query(q=q, status=status, tag=tag, source=source).order_by(
        _SORTS[sort], Contact.id
    )
    return await paginate(session, stmt, offset=offset, limit=limit)


async def stats(session: AsyncSession) -> dict[str, int]:
    rows = await session.execute(select(Contact.status, func.count()).group_by(Contact.status))
    counts = {s.value: c for s, c in rows.all()}
    return {
        "total": sum(counts.values()),
        "subscribed": counts.get(SubscriptionStatus.SUBSCRIBED.value, 0),
        "unsubscribed": counts.get(SubscriptionStatus.UNSUBSCRIBED.value, 0),
        "pending": counts.get(SubscriptionStatus.PENDING.value, 0),
    }


async def get_contact(session: AsyncSession, contact_id: str) -> Contact:
    contact = await session.get(Contact, contact_id)
    if contact is None:
        raise NotFoundError(f"Contact {contact_id} not found")
    return contact


async def get_by_email(session: AsyncSession, email: str) -> Contact | None:
    return await session.scalar(select(Contact).where(Contact.email == normalize_email(email)))


# --- Mutations ------------------------------------------------------------------------


def _apply_status(contact: Contact, status: SubscriptionStatus) -> None:
    changed = contact.status is not status
    contact.status = status
    now = utcnow()
    if status is SubscriptionStatus.SUBSCRIBED and (changed or contact.subscribed_at is None):
        contact.subscribed_at = now
        contact.unsubscribed_at = None
    elif status is SubscriptionStatus.UNSUBSCRIBED and (changed or contact.unsubscribed_at is None):
        contact.unsubscribed_at = now


async def create_contact(
    session: AsyncSession, data: ContactCreate, *, fire_events: bool = True
) -> Contact:
    email = normalize_email(data.email)
    if await get_by_email(session, email):
        raise ConflictError(f"A contact with email {email} already exists")
    contact = Contact(
        email=email,
        name=data.name,
        source=data.source,
        attributes=data.attributes,
        status=data.status,
    )
    _apply_status(contact, data.status)
    contact.tags = await get_or_create_tags(session, data.tags)
    session.add(contact)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(f"A contact with email {email} already exists") from exc
    if fire_events:
        await _fire_contact_events(session, contact, data.tags, newly_subscribed=True)
    await session.commit()
    return contact


async def _fire_contact_events(
    session: AsyncSession, contact: Contact, added_tags: Sequence[str], *, newly_subscribed: bool
) -> None:
    if contact.status is not SubscriptionStatus.SUBSCRIBED:
        return
    if newly_subscribed:
        await automation_service.handle_event(session, TriggerType.CONTACT_SUBSCRIBED, contact)
    for tag in added_tags:
        await automation_service.handle_event(session, TriggerType.TAG_ADDED, contact, {"tag": tag})


async def update_contact(session: AsyncSession, contact_id: str, data: ContactUpdate) -> Contact:
    contact = await get_contact(session, contact_id)
    changes = data.model_dump(exclude_unset=True)
    was_subscribed = contact.status is SubscriptionStatus.SUBSCRIBED
    previous_tags = set(contact.tag_names)

    if changes.get("email"):
        email = normalize_email(changes.pop("email"))
        if email != contact.email:
            if await get_by_email(session, email):
                raise ConflictError(f"A contact with email {email} already exists")
            contact.email = email
    if "tags" in changes:
        contact.tags = await get_or_create_tags(session, changes.pop("tags") or [])
    if changes.get("status"):
        _apply_status(contact, changes.pop("status"))
    for key, value in changes.items():
        if value is not None:
            setattr(contact, key, value)
    contact.updated_at = utcnow()
    await session.flush()
    await _fire_contact_events(
        session,
        contact,
        [t for t in contact.tag_names if t not in previous_tags],
        newly_subscribed=not was_subscribed,
    )
    await session.commit()
    return contact


async def delete_contact(session: AsyncSession, contact_id: str) -> None:
    contact = await get_contact(session, contact_id)
    await session.delete(contact)
    await session.commit()


async def bulk_delete(session: AsyncSession, ids: Sequence[str]) -> int:
    result = await session.execute(delete(Contact).where(Contact.id.in_(list(ids))))
    await session.commit()
    return result.rowcount or 0


async def bulk_add_tag(session: AsyncSession, ids: Sequence[str], tag_name: str) -> int:
    (tag,) = await get_or_create_tags(session, [tag_name])
    already = select(contact_tags.c.contact_id).where(contact_tags.c.tag_id == tag.id)
    targets = list(
        await session.scalars(
            select(Contact).where(Contact.id.in_(list(ids)), Contact.id.not_in(already))
        )
    )
    if targets:
        await session.execute(
            insert(contact_tags), [{"contact_id": c.id, "tag_id": tag.id} for c in targets]
        )
        for contact in targets:
            await session.refresh(contact, ["tags"])
            await _fire_contact_events(session, contact, [tag.name], newly_subscribed=False)
    await session.commit()
    return len(targets)


async def bulk_remove_tag(session: AsyncSession, ids: Sequence[str], tag_name: str) -> int:
    tag_id = await session.scalar(select(Tag.id).where(Tag.name == tag_name))
    if tag_id is None:
        return 0
    result = await session.execute(
        delete(contact_tags).where(
            contact_tags.c.tag_id == tag_id, contact_tags.c.contact_id.in_(list(ids))
        )
    )
    await session.commit()
    session.expire_all()
    return result.rowcount or 0


async def bulk_set_status(
    session: AsyncSession, ids: Sequence[str], status: SubscriptionStatus
) -> int:
    contacts = list(await session.scalars(select(Contact).where(Contact.id.in_(list(ids)))))
    for contact in contacts:
        was_subscribed = contact.status is SubscriptionStatus.SUBSCRIBED
        _apply_status(contact, status)
        await _fire_contact_events(session, contact, [], newly_subscribed=not was_subscribed)
    await session.commit()
    return len(contacts)


# --- CSV import / export ------------------------------------------------------------------


def _parse_status(raw: str | None) -> SubscriptionStatus | None:
    if not raw:
        return None
    for status in SubscriptionStatus:
        if status.value.lower() == raw.strip().lower():
            return status
    raise ValueError(f"invalid status {raw!r}")


async def import_csv(
    session: AsyncSession,
    content: bytes,
    *,
    default_tags: Sequence[str] = (),
    update_existing: bool = True,
) -> dict[str, Any]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError("CSV must be UTF-8 encoded", code="invalid_csv") from exc
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise AppError("CSV is empty", code="invalid_csv")
    header = {name.strip().lower(): name for name in reader.fieldnames if name}
    if "email" not in header:
        raise AppError("CSV must include an 'email' column", code="invalid_csv")

    created = updated = skipped = 0
    errors: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line_no, row in enumerate(reader, start=2):
        if line_no - 1 > MAX_IMPORT_ROWS:
            raise AppError(f"CSV exceeds {MAX_IMPORT_ROWS} rows", code="invalid_csv")

        def get(col: str, row: dict[str, str | None] = row) -> str:
            return (row.get(header[col]) or "").strip() if col in header else ""

        try:
            email = validate_email(get("email"), check_deliverability=False).normalized.lower()
            status = _parse_status(get("status"))
        except (EmailNotValidError, ValueError) as exc:
            errors.append({"line": line_no, "email": get("email"), "error": str(exc)})
            continue
        if email in seen:
            skipped += 1
            continue
        seen.add(email)
        tags = [t for t in get("tags").replace(";", ",").split(",") if t.strip()]
        tags = [*tags, *default_tags]

        existing = await get_by_email(session, email)
        if existing is None:
            contact = Contact(
                email=email,
                name=get("name"),
                source=get("source") or "CSV Import",
                status=status or SubscriptionStatus.SUBSCRIBED,
            )
            _apply_status(contact, contact.status)
            contact.tags = await get_or_create_tags(session, tags)
            session.add(contact)
            created += 1
        elif update_existing:
            if get("name"):
                existing.name = get("name")
            # Never resubscribe someone who opted out just because they appear in an import.
            if status and existing.status is not SubscriptionStatus.UNSUBSCRIBED:
                _apply_status(existing, status)
            if tags:
                merged = {*existing.tag_names, *(t.strip() for t in tags)}
                existing.tags = await get_or_create_tags(session, sorted(merged))
            updated += 1
        else:
            skipped += 1
        if (created + updated) % 500 == 0:
            await session.flush()
    await session.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors[:200]}


def _csv_safe(value: str) -> str:
    # Neutralise spreadsheet formula injection.
    return f"'{value}" if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


async def export_csv(
    session: AsyncSession,
    *,
    q: str | None = None,
    status: SubscriptionStatus | None = None,
    tag: str | None = None,
    source: str | None = None,
    chunk_size: int = 1000,
) -> AsyncIterator[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    yield buffer.getvalue()
    base = filtered_query(q=q, status=status, tag=tag, source=source).order_by(Contact.id)
    last_id = ""
    while True:
        rows = list(await session.scalars(base.where(Contact.id > last_id).limit(chunk_size)))
        if not rows:
            break
        buffer.seek(0)
        buffer.truncate()
        for c in rows:
            writer.writerow(
                [
                    c.email,
                    _csv_safe(c.name),
                    _csv_safe(";".join(c.tag_names)),
                    c.status.value,
                    _csv_safe(c.source),
                    c.created_at.date().isoformat(),
                ]
            )
        yield buffer.getvalue()
        last_id = rows[-1].id
