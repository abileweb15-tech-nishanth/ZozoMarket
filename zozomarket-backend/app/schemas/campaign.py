import datetime as dt
from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field, field_validator

from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.schemas.common import CamelModel, InputModel


class CampaignContent(InputModel):
    subject: str | None = Field(default=None, max_length=300)
    preheader: str | None = Field(default=None, max_length=300)
    from_name: str | None = Field(default=None, max_length=120)
    from_email: EmailStr | None = None
    reply_to: EmailStr | None = None
    template_id: str | None = None
    html: str | None = Field(default=None, max_length=2_000_000)
    design: list[dict[str, Any]] | None = None


class CampaignCreate(CampaignContent):
    name: str = Field(min_length=1, max_length=200)
    type: CampaignType = CampaignType.NEWSLETTER
    audience: str = Field(default="All Subscribers", max_length=120)
    audience_tags: list[str] = Field(default_factory=list, max_length=50)
    # Optional: create directly in Scheduled state.
    scheduled_at: datetime | None = None

    @field_validator("scheduled_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("scheduledAt must include a timezone offset (e.g. ...Z)")
        return v


class CampaignUpdate(CampaignContent):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    type: CampaignType | None = None
    audience: str | None = Field(default=None, max_length=120)
    audience_tags: list[str] | None = Field(default=None, max_length=50)


class ScheduleRequest(InputModel):
    scheduled_at: datetime

    @field_validator("scheduled_at")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("scheduledAt must include a timezone offset (e.g. ...Z)")
        return v


class TestSendRequest(InputModel):
    emails: list[EmailStr] = Field(min_length=1, max_length=10)


class CampaignRead(CamelModel):
    id: str
    name: str
    audience: str
    audience_tags: list[str]
    type: CampaignType
    status: CampaignStatus
    date: dt.date
    recipients: int
    delivery: float | None
    open: float | None
    click: float | None
    subject: str
    preheader: str
    from_name: str | None
    from_email: str | None
    reply_to: str | None
    template_id: str | None
    scheduled_at: datetime | None
    sent_at: datetime | None
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, c: Campaign) -> "CampaignRead":
        return cls(
            id=c.id,
            name=c.name,
            audience=c.audience,
            audience_tags=c.audience_tags or [],
            type=c.type,
            status=c.status,
            date=c.effective_at.date(),
            recipients=c.recipients,
            delivery=c.delivery_rate,
            open=c.open_rate,
            click=c.click_rate,
            subject=c.subject,
            preheader=c.preheader,
            from_name=c.from_name,
            from_email=c.from_email,
            reply_to=c.reply_to,
            template_id=c.template_id,
            scheduled_at=c.scheduled_at,
            sent_at=c.sent_at,
            failure_reason=c.failure_reason,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )


class CampaignDetail(CampaignRead):
    html: str
    design: list[dict[str, Any]]
    sent_count: int
    delivered_count: int
    opened_count: int
    clicked_count: int
    bounced_count: int
    unsubscribed_count: int

    @classmethod
    def from_model(cls, c: Campaign) -> "CampaignDetail":
        base = CampaignRead.from_model(c).model_dump(by_alias=False)
        return cls(
            **base,
            html=c.html,
            design=c.design or [],
            sent_count=c.sent_count,
            delivered_count=c.delivered_count,
            opened_count=c.opened_count,
            clicked_count=c.clicked_count,
            bounced_count=c.bounced_count,
            unsubscribed_count=c.unsubscribed_count,
        )


class RecipientEstimate(CamelModel):
    recipients: int
    audience_tags: list[str]
