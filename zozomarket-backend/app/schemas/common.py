from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    """Serialises to camelCase (matching the Next.js frontend) and accepts either case."""

    # Responses are emitted by alias (camelCase) by FastAPI; internal model_dump() stays
    # snake_case so it can feed ORM constructors directly.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class InputModel(CamelModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ApiResponse(CamelModel, Generic[T]):
    success: bool = True
    data: T


class ListResponse(CamelModel, Generic[T]):
    success: bool = True
    data: list[T]
    total: int
    page: int = 1
    page_size: int = Field(default=50)
    pages: int = 1


class SuccessResponse(CamelModel):
    success: bool = True


class AffectedCount(CamelModel):
    affected: int


class IdList(InputModel):
    ids: list[str] = Field(min_length=1, max_length=5000)
