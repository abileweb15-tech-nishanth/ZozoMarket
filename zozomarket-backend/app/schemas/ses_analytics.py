from typing import Literal
from pydantic import BaseModel, ConfigDict


class SesMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    send: int = 0
    delivery: int = 0
    open: int = 0
    click: int = 0
    bounce: int = 0
    complaint: int = 0
    reject: int = 0


class SesRates(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deliveryRate: float = 0.0
    openRate: float = 0.0
    clickRate: float = 0.0
    bounceRate: float = 0.0
    complaintRate: float = 0.0


class SesCampaignBreakdown(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    campaign: str
    sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    bounced: int = 0
    complaint: int = 0
    openRate: float = 0.0


class SesAnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    timeframeHours: int
    mode: Literal["single", "overall"]
    campaign: str
    availableCampaigns: list[str] = []
    metrics: SesMetrics
    rates: SesRates
    breakdown: list[SesCampaignBreakdown] = []

