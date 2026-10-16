import re
from datetime import datetime
from typing import Any, Literal

from pydantic import EmailStr, Field, field_validator

from app.models.form import Form, FormKind, FormStatus
from app.schemas.common import CamelModel, InputModel

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _check_slug(v: str | None) -> str | None:
    if v is not None and not _SLUG.match(v):
        raise ValueError("slug must be lowercase letters, digits and hyphens")
    return v


class FormField(CamelModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")
    label: str = Field(min_length=1, max_length=120)
    type: Literal["text", "email", "tel", "number", "textarea", "checkbox", "select"] = "text"
    required: bool = False
    options: list[str] | None = None


class FormCreate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    kind: FormKind = FormKind.SIGNUP
    slug: str | None = Field(default=None, max_length=120)
    title: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=5000)
    success_message: str = Field(default="Thanks for subscribing!", max_length=500)
    redirect_url: str | None = Field(default=None, max_length=500)
    fields: list[FormField] = Field(default_factory=list, max_length=30)
    tags: list[str] = Field(default_factory=list, max_length=20)
    double_opt_in: bool = False

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        return _check_slug(v)


class FormUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    kind: FormKind | None = None
    status: FormStatus | None = None
    slug: str | None = Field(default=None, max_length=120)
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    success_message: str | None = Field(default=None, max_length=500)
    redirect_url: str | None = Field(default=None, max_length=500)
    fields: list[FormField] | None = Field(default=None, max_length=30)
    tags: list[str] | None = Field(default=None, max_length=20)
    double_opt_in: bool | None = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        return _check_slug(v)


class FormRead(CamelModel):
    id: str
    name: str
    slug: str
    kind: FormKind
    status: FormStatus
    title: str
    description: str
    success_message: str
    redirect_url: str | None
    fields: list[FormField]
    tags: list[str]
    double_opt_in: bool
    views: int
    subs: int
    conversion_rate: float | None
    public_url: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, f: Form, public_url: str) -> "FormRead":
        return cls(
            id=f.id,
            name=f.name,
            slug=f.slug,
            kind=f.kind,
            status=f.status,
            title=f.title,
            description=f.description,
            success_message=f.success_message,
            redirect_url=f.redirect_url,
            fields=f.fields or [],
            tags=f.tags or [],
            double_opt_in=f.double_opt_in,
            views=f.views,
            subs=f.submissions,
            conversion_rate=f.conversion_rate,
            public_url=public_url,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )


class PublicFormConfig(CamelModel):
    slug: str
    kind: FormKind
    title: str
    description: str
    fields: list[FormField]
    double_opt_in: bool


class FormSubmission(InputModel):
    email: EmailStr
    name: str = Field(default="", max_length=200)
    fields: dict[str, Any] = Field(default_factory=dict)
    consent: bool = True
    # Honeypot: real users never fill this hidden input.
    website: str | None = Field(default=None, max_length=500)


class FormSubmissionResult(CamelModel):
    message: str
    redirect_url: str | None
    requires_confirmation: bool
