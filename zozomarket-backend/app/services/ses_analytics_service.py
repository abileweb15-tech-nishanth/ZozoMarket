"""Amazon SES CloudWatch metrics fetching and aggregation service.

Retrieves campaign-level and aggregate email statistics (Send, Delivery, Open,
Click, Bounce, Complaint, Reject) from AWS CloudWatch under namespace 'AWS/SES'.
"""

import asyncio
import datetime as dt
import logging
import re
import time
from typing import Literal

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings
from app.schemas.ses_analytics import (
    SesAnalyticsResponse,
    SesCampaignBreakdown,
    SesMetrics,
    SesRates,
)

logger = logging.getLogger(__name__)

_METRICS = ("Send", "Delivery", "Open", "Click", "Bounce", "Complaint", "Reject")

_CACHE: dict[tuple[str, int], tuple[float, SesAnalyticsResponse]] = {}
_ACTIVE_CAMPAIGNS_CACHE: tuple[float, list[str]] = (0.0, [])
_CACHE_TTL_SECONDS = 30.0


def _secret(value: object) -> str:
    if value is None:
        return ""
    revealed = value.get_secret_value() if hasattr(value, "get_secret_value") else str(value)
    return revealed or ""


def _get_cloudwatch_client():
    access_key = (settings.AWS_ACCESS_KEY_ID or "").strip()
    secret_key = _secret(settings.AWS_SECRET_ACCESS_KEY)
    if not access_key or not secret_key:
        return None
    return boto3.client(
        "cloudwatch",
        region_name=settings.AWS_REGION,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def parse_timeframe(timeframe: str | int | None) -> int:
    """Parse timeframe into integer hours.
    Accepts e.g. '24h', '7d', '30d', '168h', 24, etc. Defaults to 24.
    """
    if timeframe is None:
        return 24
    if isinstance(timeframe, int):
        return max(1, min(2160, timeframe))

    s = str(timeframe).strip().lower()
    if not s:
        return 24

    match = re.match(r"^(\d+)([hd])?$", s)
    if not match:
        return 24

    val = int(match.group(1))
    unit = match.group(2)
    hours = val * 24 if unit == "d" else val
    return max(1, min(2160, hours))


def _discover_active_campaigns_sync() -> list[str]:
    client = _get_cloudwatch_client()
    if client is None:
        fallback = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
        return [fallback] if fallback else []

    try:
        paginator = client.get_paginator("list_metrics")
        campaigns = set()
        for page in paginator.paginate(Namespace="AWS/SES"):
            for metric in page.get("Metrics", []):
                for dim in metric.get("Dimensions", []):
                    if dim.get("Name") == "campaign":
                        val = (dim.get("Value") or "").strip()
                        if val:
                            campaigns.add(val)
        # Also include default if set
        default_val = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
        if default_val:
            campaigns.add(default_val)
        return sorted(campaigns)
    except ClientError as exc:
        logger.warning("CloudWatch ListMetrics failed: %s", exc)
        default_val = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
        return [default_val] if default_val else []
    except Exception:
        logger.warning("Error discovering CloudWatch campaigns", exc_info=True)
        return []


async def get_active_campaigns() -> list[str]:
    """Returns active campaign tag names discovered in CloudWatch."""
    global _ACTIVE_CAMPAIGNS_CACHE
    now = time.monotonic()
    if _ACTIVE_CAMPAIGNS_CACHE[1] and (now - _ACTIVE_CAMPAIGNS_CACHE[0] < _CACHE_TTL_SECONDS * 2):
        return _ACTIVE_CAMPAIGNS_CACHE[1]

    campaigns = await asyncio.to_thread(_discover_active_campaigns_sync)
    _ACTIVE_CAMPAIGNS_CACHE = (now, campaigns)
    return campaigns


def _query_metric_sum(
    client,
    metric_name: str,
    dimensions: list[dict[str, str]],
    start_time: dt.datetime,
    end_time: dt.datetime,
    period: int,
) -> int:
    try:
        response = client.get_metric_statistics(
            Namespace="AWS/SES",
            MetricName=metric_name,
            Dimensions=dimensions,
            StartTime=start_time,
            EndTime=end_time,
            Period=period,
            Statistics=["Sum"],
        )
        total = sum(point.get("Sum", 0.0) for point in response.get("Datapoints", []))
        return int(round(total))
    except ClientError as exc:
        logger.debug("CloudWatch GetMetricStatistics for %s failed: %s", metric_name, exc)
        return 0
    except Exception:
        logger.debug("CloudWatch GetMetricStatistics error for %s", metric_name, exc_info=True)
        return 0


def _calculate_rates(
    send: int, delivery: int, open_: int, click: int, bounce: int, complaint: int
) -> SesRates:
    delivery_rate = round((delivery / send) * 100, 1) if send > 0 else 0.0
    open_rate = round((open_ / delivery) * 100, 1) if delivery > 0 else 0.0
    click_rate = round((click / open_) * 100, 1) if open_ > 0 else 0.0
    bounce_rate = round((bounce / send) * 100, 1) if send > 0 else 0.0
    complaint_rate = round((complaint / delivery) * 100, 1) if delivery > 0 else 0.0
    return SesRates(
        deliveryRate=delivery_rate,
        openRate=open_rate,
        clickRate=click_rate,
        bounceRate=bounce_rate,
        complaintRate=complaint_rate,
    )


def _fetch_metrics_sync(campaign: str | None, timeframe_hours: int) -> SesAnalyticsResponse:
    client = _get_cloudwatch_client()
    now_utc = dt.datetime.now(dt.timezone.utc)
    start_utc = now_utc - dt.timedelta(hours=timeframe_hours)
    period = max(60, min(86400, timeframe_hours * 3600))

    available = _discover_active_campaigns_sync()
    is_single = bool(campaign and campaign.strip().lower() not in ("all", "overall", "*"))

    if client is None:
        # AWS credentials not configured or failed to initialize
        blank_metrics = SesMetrics()
        blank_rates = SesRates()
        mode: Literal["single", "overall"] = "single" if is_single else "overall"
        return SesAnalyticsResponse(
            timeframeHours=timeframe_hours,
            mode=mode,
            campaign=campaign if is_single and campaign else "all",
            availableCampaigns=available,
            metrics=blank_metrics,
            rates=blank_rates,
            breakdown=[],
        )

    if is_single and campaign:
        camp_val = campaign.strip()
        dims = [{"Name": "campaign", "Value": camp_val}]
        m_counts: dict[str, int] = {}
        for m in _METRICS:
            m_counts[m.lower()] = _query_metric_sum(client, m, dims, start_utc, now_utc, period)

        metrics = SesMetrics(
            send=m_counts.get("send", 0),
            delivery=m_counts.get("delivery", 0),
            open=m_counts.get("open", 0),
            click=m_counts.get("click", 0),
            bounce=m_counts.get("bounce", 0),
            complaint=m_counts.get("complaint", 0),
            reject=m_counts.get("reject", 0),
        )
        rates = _calculate_rates(
            metrics.send,
            metrics.delivery,
            metrics.open,
            metrics.click,
            metrics.bounce,
            metrics.complaint,
        )
        return SesAnalyticsResponse(
            timeframeHours=timeframe_hours,
            mode="single",
            campaign=camp_val,
            availableCampaigns=available,
            metrics=metrics,
            rates=rates,
            breakdown=[],
        )

    # Overall Mode: Aggregate across all discovered campaigns
    breakdowns: list[SesCampaignBreakdown] = []
    tot_send = tot_delivery = tot_open = tot_click = tot_bounce = tot_complaint = tot_reject = 0

    campaign_list = list(available)
    if not campaign_list:
        default_val = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
        if default_val:
            campaign_list = [default_val]

    for c in campaign_list:
        dims = [{"Name": "campaign", "Value": c}]
        c_send = _query_metric_sum(client, "Send", dims, start_utc, now_utc, period)
        c_deliv = _query_metric_sum(client, "Delivery", dims, start_utc, now_utc, period)
        c_open = _query_metric_sum(client, "Open", dims, start_utc, now_utc, period)
        c_click = _query_metric_sum(client, "Click", dims, start_utc, now_utc, period)
        c_bounce = _query_metric_sum(client, "Bounce", dims, start_utc, now_utc, period)
        c_comp = _query_metric_sum(client, "Complaint", dims, start_utc, now_utc, period)
        c_rej = _query_metric_sum(client, "Reject", dims, start_utc, now_utc, period)

        c_open_rate = round((c_open / c_deliv) * 100, 1) if c_deliv > 0 else 0.0

        breakdowns.append(
            SesCampaignBreakdown(
                campaign=c,
                sent=c_send,
                delivered=c_deliv,
                opened=c_open,
                clicked=c_click,
                bounced=c_bounce,
                complaint=c_comp,
                openRate=c_open_rate,
            )
        )

        tot_send += c_send
        tot_delivery += c_deliv
        tot_open += c_open
        tot_click += c_click
        tot_bounce += c_bounce
        tot_complaint += c_comp
        tot_reject += c_rej

    # Fallback to configuration set dimension if campaign breakdown produced 0 sends
    if tot_send == 0 and settings.SES_CONFIGURATION_SET:
        cfg_dims = [{"Name": "ses:configuration-set", "Value": settings.SES_CONFIGURATION_SET}]
        cfg_send = _query_metric_sum(client, "Send", cfg_dims, start_utc, now_utc, period)
        if cfg_send > 0:
            tot_send = cfg_send
            tot_delivery = _query_metric_sum(client, "Delivery", cfg_dims, start_utc, now_utc, period)
            tot_open = _query_metric_sum(client, "Open", cfg_dims, start_utc, now_utc, period)
            tot_click = _query_metric_sum(client, "Click", cfg_dims, start_utc, now_utc, period)
            tot_bounce = _query_metric_sum(client, "Bounce", cfg_dims, start_utc, now_utc, period)
            tot_complaint = _query_metric_sum(client, "Complaint", cfg_dims, start_utc, now_utc, period)
            tot_reject = _query_metric_sum(client, "Reject", cfg_dims, start_utc, now_utc, period)

    metrics = SesMetrics(
        send=tot_send,
        delivery=tot_delivery,
        open=tot_open,
        click=tot_click,
        bounce=tot_bounce,
        complaint=tot_complaint,
        reject=tot_reject,
    )
    rates = _calculate_rates(
        metrics.send,
        metrics.delivery,
        metrics.open,
        metrics.click,
        metrics.bounce,
        metrics.complaint,
    )

    return SesAnalyticsResponse(
        timeframeHours=timeframe_hours,
        mode="overall",
        campaign="all",
        availableCampaigns=available,
        metrics=metrics,
        rates=rates,
        breakdown=breakdowns,
    )


async def get_ses_analytics(
    campaign: str | None = "all", timeframe: str | int | None = "24h"
) -> SesAnalyticsResponse:
    """Fetch SES CloudWatch analytics with caching."""
    tf_hours = parse_timeframe(timeframe)
    camp_key = (campaign or "all").strip().lower()

    cache_key = (camp_key, tf_hours)
    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    if cached is not None and (now - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]

    result = await asyncio.to_thread(_fetch_metrics_sync, campaign, tf_hours)
    _CACHE[cache_key] = (now, result)
    return result

