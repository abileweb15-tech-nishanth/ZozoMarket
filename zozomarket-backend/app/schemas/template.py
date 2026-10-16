from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.models.template import EmailTemplate
from app.schemas.common import CamelModel, InputModel


class BuilderBlock(CamelModel):
    """Mirrors the `Block` type of the frontend's visual email builder."""

    id: str | None = None
    type: Literal[
        "heading",
        "paragraph",
        "image",
        "button",
        "divider",
        "spacer",
        "columns",
        "social",
        "product",
        "banner",
        "footer",
        "logo",
    ]
    text: str = Field(default="", max_length=20_000)
    align: Literal["left", "center", "right"] = "center"
    size: int = Field(default=15, ge=8, le=96)
    color: str = Field(default="#1f2937", max_length=32)
    bg: str = Field(default="#ffffff", max_length=32)
    padding: int = Field(default=16, ge=0, le=200)
    link: str | None = Field(default=None, max_length=2000)
    image: str | None = Field(default=None, max_length=2000)


class TemplateCreate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="General", max_length=64)
    image: str | None = Field(default=None, max_length=500)
    subject: str = Field(default="", max_length=300)
    preheader: str = Field(default="", max_length=300)
    html: str = Field(default="", max_length=2_000_000)
    design: list[BuilderBlock] = Field(default_factory=list, max_length=500)


class TemplateUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=64)
    image: str | None = Field(default=None, max_length=500)
    subject: str | None = Field(default=None, max_length=300)
    preheader: str | None = Field(default=None, max_length=300)
    html: str | None = Field(default=None, max_length=2_000_000)
    design: list[BuilderBlock] | None = Field(default=None, max_length=500)


class TemplateRead(CamelModel):
    id: str
    name: str
    category: str
    image: str | None
    subject: str
    preheader: str
    is_system: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, t: EmailTemplate) -> "TemplateRead":
        return cls.model_validate(t)


class TemplateDetail(TemplateRead):
    html: str
    design: list[dict[str, Any]]


class PreviewRequest(InputModel):
    # Merge-tag values, e.g. {"first_name": "Priya"}. Missing tags render as sample data.
    variables: dict[str, str] = Field(default_factory=dict)


class RenderRequest(InputModel):
    design: list[BuilderBlock] = Field(min_length=1, max_length=500)
    preheader: str = Field(default="", max_length=300)
    variables: dict[str, str] | None = None


class RenderedEmail(CamelModel):
    html: str
    text: str


class CategoryCount(CamelModel):
    name: str
    count: int
