from app.schemas.calendar import CalendarEvent
from app.schemas.campaign import CampaignRead
from app.schemas.common import CamelModel


class KPI(CamelModel):
    value: str  # display-formatted, e.g. "95,000" or "98.8%"
    raw: float
    # vs previous 30 days: % change for volumes, percentage points for rates,
    # and new-in-window count for scheduled campaigns / active automations.
    trend: float


class DashboardKPIs(CamelModel):
    emails_delivered: KPI
    delivery_rate: KPI
    email_open_rate: KPI
    avg_click_rate: KPI
    total_subscribers: KPI
    scheduled_campaigns: KPI
    active_automations: KPI


class DashboardData(CamelModel):
    kpis: DashboardKPIs
    recent_campaigns: list[CampaignRead]
    upcoming_events: list[CalendarEvent]
