from pydantic import EmailStr, Field, field_validator

from app.models.account import Workspace
from app.schemas.common import CamelModel, InputModel


class WorkspaceUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    website: str | None = Field(default=None, max_length=500)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    mailing_address: str | None = Field(default=None, max_length=2000)
    brand_color: str | None = Field(default=None, min_length=4, max_length=32)
    font: str | None = Field(default=None, min_length=1, max_length=64)
    from_name: str | None = Field(default=None, max_length=120)
    from_email: EmailStr | None = None
    reply_to: EmailStr | None = None
    track_opens: bool | None = None
    track_clicks: bool | None = None

    @field_validator("website", "from_email", "reply_to", mode="before")
    @classmethod
    def _blank_optional(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class WorkspaceRead(CamelModel):
    id: str
    name: str
    website: str | None
    timezone: str
    mailing_address: str
    brand_color: str
    font: str
    logo_url: str | None
    from_name: str
    from_email: str | None
    reply_to: str | None
    track_opens: bool
    track_clicks: bool
    owner_name: str
    owner_email: str

    @classmethod
    def from_workspace(
        cls, workspace: Workspace, *, owner_name: str, owner_email: str
    ) -> "WorkspaceRead":
        return cls(
            id=workspace.id,
            name=workspace.name,
            website=workspace.website,
            timezone=workspace.timezone,
            mailing_address=workspace.mailing_address or "",
            brand_color=workspace.brand_color,
            font=workspace.font,
            logo_url=workspace.logo_url,
            from_name=workspace.from_name or "",
            from_email=workspace.from_email,
            reply_to=workspace.reply_to,
            track_opens=workspace.track_opens,
            track_clicks=workspace.track_clicks,
            owner_name=owner_name,
            owner_email=owner_email,
        )
