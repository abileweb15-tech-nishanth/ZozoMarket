import datetime as dt

from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.schemas.common import CamelModel


class CalendarEvent(CamelModel):
    id: str
    title: str
    date: dt.date
    time: str  # "HH:MM" (UTC)
    type: CampaignType
    status: CampaignStatus
    campaign_id: str
    starts_at: dt.datetime
    recipients: int

    @classmethod
    def from_campaign(cls, c: Campaign) -> "CalendarEvent":
        at = c.effective_at
        return cls(
            id=c.id,
            title=c.name,
            date=at.date(),
            time=at.strftime("%H:%M"),
            type=c.type,
            status=c.status,
            campaign_id=c.id,
            starts_at=at,
            recipients=c.recipients,
        )


class CalendarDaySummary(CamelModel):
    date: dt.date
    total: int
    by_status: dict[str, int]
