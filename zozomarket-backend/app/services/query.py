from typing import Any, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


def like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def ilike(column: Any, term: str) -> Any:
    return column.ilike(like_pattern(term), escape="\\")


async def paginate(
    session: AsyncSession, stmt: Select[tuple[T]], *, offset: int, limit: int
) -> tuple[list[T], int]:
    total = await session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = await session.scalars(stmt.offset(offset).limit(limit))
    return list(rows.unique()), total or 0
