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


class AwsSettingsUpdate(InputModel):
    aws_access_key_id: str | None = Field(default=None, max_length=256)
    aws_secret_access_key: str | None = Field(default=None, max_length=512)
    aws_region: str | None = Field(default=None, min_length=2, max_length=64)
    aws_encryption_disabled: bool | None = None
    aws_s3_media_enabled: bool | None = None

    @field_validator("aws_access_key_id", "aws_secret_access_key", "aws_region", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


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
    has_aws_access_key: bool
    has_aws_secret_key: bool
    aws_region: str
    aws_encryption_disabled: bool
    ses_configuration_set: str | None = None
    sqs_queue_url: str | None = None
    s3_bucket_name: str | None = None
    aws_s3_media_enabled: bool = True
    aws_provisioning_warnings: list[str] = Field(default_factory=list)
    owner_name: str
    owner_email: str

    @classmethod
    def from_workspace(
        cls,
        workspace: Workspace,
        *,
        owner_name: str,
        owner_email: str,
        provisioning_warnings: list[str] | None = None,
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
            has_aws_access_key=bool((workspace.aws_access_key_id or "").strip()),
            has_aws_secret_key=bool((workspace.aws_secret_access_key or "").strip()),
            aws_region=workspace.aws_region or "us-east-1",
            aws_encryption_disabled=bool(workspace.aws_encryption_disabled),
            ses_configuration_set=workspace.ses_configuration_set,
            sqs_queue_url=workspace.sqs_queue_url,
            s3_bucket_name=workspace.s3_bucket_name,
            aws_s3_media_enabled=bool(getattr(workspace, "aws_s3_media_enabled", True)),
            aws_provisioning_warnings=provisioning_warnings or [],
            owner_name=owner_name,
            owner_email=owner_email,
        )
