from collections.abc import Sequence
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.contact import Contact, SubscriptionStatus, Tag, contact_tags
from app.models.segment import Segment
from app.schemas.segment import SegmentConditionInput, SegmentCreate, SegmentUpdate
from app.services.query import paginate


def _has_any_tag(tags: Sequence[str]) -> Any:
    return Contact.id.in_(
        select(contact_tags.c.contact_id)
        .join(Tag, Tag.id == contact_tags.c.tag_id)
        .where(Tag.name.in_(list(tags)))
    )


def segment_query(segment: Segment | SegmentCreate | SegmentConditionInput) -> Select[tuple[Contact]]:
    stmt = select(Contact)
    if segment.status:
        stmt = stmt.where(Contact.status == segment.status)
    if segment.source:
        stmt = stmt.where(Contact.source == segment.source)
    clean_tags = [t.strip() for t in (segment.tags or []) if t and t.strip()]
    if clean_tags:
        if segment.match_type == "all":
            for t in clean_tags:
                stmt = stmt.where(_has_any_tag([t]))
        else:
            stmt = stmt.where(_has_any_tag(clean_tags))
    return stmt


async def count_contacts_for_segment(
    session: AsyncSession, segment: Segment | SegmentCreate | SegmentConditionInput
) -> int:
    stmt = segment_query(segment).with_only_columns(func.count(Contact.id))
    return await session.scalar(stmt) or 0


async def list_segments(session: AsyncSession) -> list[tuple[Segment, int]]:
    stmt = select(Segment).order_by(Segment.created_at.desc())
    segments = list((await session.scalars(stmt)).all())
    result = []
    for s in segments:
        count = await count_contacts_for_segment(session, s)
        result.append((s, count))
    return result


async def get_segment(session: AsyncSession, segment_id: str) -> tuple[Segment, int]:
    segment = await session.get(Segment, segment_id)
    if not segment:
        raise NotFoundError("Segment not found")
    count = await count_contacts_for_segment(session, segment)
    return segment, count


async def create_segment(session: AsyncSession, data: SegmentCreate) -> tuple[Segment, int]:
    name = data.name.strip()
    existing = await session.scalar(select(Segment).where(Segment.name == name))
    if existing:
        raise ConflictError(f"A segment named '{name}' already exists")

    clean_tags = list(dict.fromkeys(t.strip() for t in data.tags if t and t.strip()))
    segment = Segment(
        name=name,
        description=data.description.strip(),
        tags=clean_tags,
        match_type=data.match_type,
        status=data.status,
        source=data.source,
    )
    session.add(segment)
    await session.commit()
    count = await count_contacts_for_segment(session, segment)
    return segment, count


async def update_segment(
    session: AsyncSession, segment_id: str, data: SegmentUpdate
) -> tuple[Segment, int]:
    segment = await session.get(Segment, segment_id)
    if not segment:
        raise NotFoundError("Segment not found")

    if data.name is not None:
        name = data.name.strip()
        if name != segment.name:
            existing = await session.scalar(select(Segment).where(Segment.name == name))
            if existing:
                raise ConflictError(f"A segment named '{name}' already exists")
            segment.name = name

    if data.description is not None:
        segment.description = data.description.strip()
    if data.tags is not None:
        segment.tags = list(dict.fromkeys(t.strip() for t in data.tags if t and t.strip()))
    if data.match_type is not None:
        segment.match_type = data.match_type
    if data.status is not None:
        segment.status = data.status
    if data.source is not None:
        segment.source = data.source

    await session.commit()
    count = await count_contacts_for_segment(session, segment)
    return segment, count


async def delete_segment(session: AsyncSession, segment_id: str) -> None:
    segment = await session.get(Segment, segment_id)
    if not segment:
        raise NotFoundError("Segment not found")
    await session.delete(segment)
    await session.commit()


async def list_segment_contacts(
    session: AsyncSession, segment_id: str, offset: int = 0, limit: int = 50
) -> tuple[list[Contact], int]:
    segment = await session.get(Segment, segment_id)
    if not segment:
        raise NotFoundError("Segment not found")
    stmt = segment_query(segment).order_by(Contact.created_at.desc())
    return await paginate(session, stmt, offset=offset, limit=limit)
