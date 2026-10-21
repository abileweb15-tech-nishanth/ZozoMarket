import math
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, Any, TypeVar

from fastapi import Depends, Query, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.exceptions import UnauthorizedError
from app.core.security import read_access_token
from app.core.tenancy import current_workspace_id
from app.models.account import User
from app.schemas.common import ListResponse

T = TypeVar("T")

DbSession = Annotated[AsyncSession, Depends(get_session)]

_bearer = HTTPBearer(auto_error=False, scheme_name="Bearer")


async def require_user(
    db: DbSession,
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> AsyncIterator[User]:
    """Require `Authorization: Bearer <access token>` and scope the request to that workspace."""
    if bearer is None or bearer.scheme.lower() != "bearer":
        raise UnauthorizedError("Missing access token")
    payload = read_access_token(bearer.credentials)
    if payload is None:
        raise UnauthorizedError("Access token is invalid or expired")
    user = await db.get(User, payload.get("sub"))
    if user is None or user.workspace_id != payload.get("wid"):
        raise UnauthorizedError("Access token is invalid or expired")
    token = current_workspace_id.set(user.workspace_id)
    try:
        yield user
    finally:
        current_workspace_id.reset(token)


CurrentUser = Annotated[User, Depends(require_user)]


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
