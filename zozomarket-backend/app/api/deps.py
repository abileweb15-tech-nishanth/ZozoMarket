import math
from dataclasses import dataclass
from typing import Annotated, Any, TypeVar

from fastapi import Depends, Query, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import verify_api_key
from app.schemas.common import ListResponse

T = TypeVar("T")

DbSession = Annotated[AsyncSession, Depends(get_session)]

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, scheme_name="ApiKey")
_bearer = HTTPBearer(auto_error=False, scheme_name="Bearer")


async def require_api_key(
    api_key: str | None = Security(_api_key_header),
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """Accepts `X-API-Key: <key>` or `Authorization: Bearer <key>`."""
    verify_api_key(api_key or (bearer.credentials if bearer else None))


@dataclass(slots=True, frozen=True)
class Pagination:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size

    def response(self, items: list[Any], total: int) -> ListResponse[Any]:
        return ListResponse(
            data=items,
            total=total,
            page=self.page,
            page_size=self.page_size,
            pages=max(1, math.ceil(total / self.page_size)),
        )


def pagination(
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> Pagination:
    return Pagination(page=page, page_size=page_size)


PageParams = Annotated[Pagination, Depends(pagination)]
