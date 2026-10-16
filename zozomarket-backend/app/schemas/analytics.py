import datetime as dt

from app.schemas.common import CamelModel


class PerformancePoint(CamelModel):
    week: str  # display label ("Sep 1"); kept as `week` for frontend compatibility
    period_start: dt.date
    sent: int
    delivered: int
    opens: int
    clicks: int
    bounces: int
    unsubscribes: int


class AnalyticsOverview(CamelModel):
    start: dt.date
    end: dt.date
    sent: int
    delivered: int
    opens: int
    clicks: int
    bounces: int
    unsubscribes: int
    delivery_rate: float | None
    open_rate: float | None
    click_rate: float | None
    click_to_open_rate: float | None
    bounce_rate: float | None
    unsubscribe_rate: float | None


class CampaignPerformance(CamelModel):
    id: str
    name: str
    type: str
    status: str
    date: dt.date
    recipients: int
    sent: int
    delivered: int
    opens: int
    clicks: int
    bounces: int
    delivery: float | None
    open: float | None
    click: float | None


class Deliverability(CamelModel):
    sent: int
    delivered: int
    bounced: int
    hard_bounces: int
    soft_bounces: int
    failed: int
    delivery_rate: float | None
    bounce_rate: float | None
    unsubscribed_contacts: int
