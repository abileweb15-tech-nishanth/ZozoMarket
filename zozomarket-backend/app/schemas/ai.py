from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel, InputModel

EmailFormat = Literal["Newsletter", "Promotional", "Welcome Sequence", "Announcement"]
Tone = Literal["Friendly", "Professional", "Playful", "Urgent", "Luxury", "Casual"]


class BriefBase(InputModel):
    goal: str = Field(min_length=3, max_length=1000)
    product: str = Field(default="", max_length=300)
    audience: str = Field(default="", max_length=300)
    tone: Tone = "Friendly"
    language: str = Field(default="English", max_length=40)


class EmailDraftRequest(BriefBase):
    format: EmailFormat = "Newsletter"
    variant: int = Field(default=0, ge=0, le=20)


class SubjectLineRequest(BriefBase):
    count: int = Field(default=5, ge=1, le=10)


class PreheaderRequest(BriefBase):
    subject: str = Field(default="", max_length=300)
    count: int = Field(default=3, ge=1, le=5)


class Section(CamelModel):
    label: str
    value: str


class EmailDraft(CamelModel):
    sections: list[Section]
    provider: str
    model: str


class TextSuggestions(CamelModel):
    suggestions: list[str]
    provider: str
    model: str
