"""Daily mail totals from the SES configuration set's CloudWatch metrics.

Uses GetMetricStatistics, which is the CloudWatch call the sender IAM user is allowed to make.
A failure returns None so the dashboard can fall back to the local send rows.
"""

import asyncio
import datetime as dt
import logging
import time

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings
from app.services.aws_credentials import get_aws_credentials

logger = logging.getLogger(__name__)

# SES metric name -> the counter the dashboard and analytics already use.
_METRIC_KEYS = {
    "Send": "sent",
    "Delivery": "delivered",
    "Open": "opens",
    "Click": "clicks",
    "Bounce": "bounces",
}
_CACHE: dict[tuple[str, str, str, str], tuple[float, dict[dt.date, dict[str, int]]]] = {}
_TTL_SECONDS = 60.0


def _blank() -> dict[str, int]:
    return {"sent": 0, "delivered": 0, "opens": 0, "clicks": 0, "bounces": 0, "unsubscribes": 0}


def _query_daily_dimensions(
    client,
    dimensions: list[dict[str, str]],
    start: dt.date,
    end: dt.date,
    start_at: dt.datetime,
    end_at: dt.datetime,
) -> dict[dt.date, dict[str, int]]:
    days: dict[dt.date, dict[str, int]] = {}
    for metric, key in _METRIC_KEYS.items():
        response = client.get_metric_statistics(
            Namespace="AWS/SES",
            MetricName=metric,
            Dimensions=dimensions,
            StartTime=start_at,
            EndTime=end_at,
            Period=86400,
            Statistics=["Sum"],
        )
        for point in response.get("Datapoints", []):
            stamp = point["Timestamp"]
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=dt.UTC)
            day = stamp.astimezone(dt.UTC).date()
            if day < start or day > end:
                continue
            bucket = days.setdefault(day, _blank())
            bucket[key] = int(point.get("Sum") or 0)
    return days


def _discover_campaign_dimensions(client) -> list[str]:
    campaigns: set[str] = set()
    paginator = client.get_paginator("list_metrics")
    for page in paginator.paginate(Namespace="AWS/SES"):
        for metric in page.get("Metrics", []):
            for dim in metric.get("Dimensions", []):
                if dim.get("Name") == "campaign":
                    val = (dim.get("Value") or "").strip()
                    if val:
                        campaigns.add(val)
    return sorted(campaigns)


def _fetch(start: dt.date, end: dt.date, campaign_name: str | None = None) -> dict[dt.date, dict[str, int]] | None:
    creds = get_aws_credentials()
    if creds is None:
        return None
    dimension = (creds.cloudwatch_dimension_name or "").strip()
    dimension_value = (creds.cloudwatch_dimension_value or "").strip()
    cfg_set = (creds.configuration_set or "").strip()

    # EndTime is exclusive, so include the whole of `end`.
    start_at = dt.datetime.combine(start, dt.time.min, tzinfo=dt.UTC)
    end_at = dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, tzinfo=dt.UTC)
    try:
        client = boto3.client(
            "cloudwatch",
            region_name=creds.region,
            aws_access_key_id=creds.access_key_id,
            aws_secret_access_key=creds.secret_access_key,
        )
        if campaign_name:
            return _query_daily_dimensions(
                client,
                [{"Name": "campaign", "Value": campaign_name.strip()}],
                start,
                end,
                start_at,
                end_at,
            )
        days: dict[dt.date, dict[str, int]] = {}
        if dimension and dimension_value:
            days = _query_daily_dimensions(
                client,
                [{"Name": dimension, "Value": dimension_value}],
                start,
                end,
                start_at,
                end_at,
            )
        if not days and cfg_set:
            days = _query_daily_dimensions(
                client,
                [{"Name": "ses:configuration-set", "Value": cfg_set}],
                start,
                end,
                start_at,
                end_at,
            )
        if not days:
            for camp in _discover_campaign_dimensions(client):
                camp_days = _query_daily_dimensions(
                    client,
                    [{"Name": "campaign", "Value": camp}],
                    start,
                    end,
                    start_at,
                    end_at,
                )
                for day, counts in camp_days.items():
                    bucket = days.setdefault(day, _blank())
                    for k, v in counts.items():
                        bucket[k] += v
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        logger.warning("SES CloudWatch stats unavailable (%s)", code)
        return None
    except Exception:
        logger.warning("SES CloudWatch stats unavailable", exc_info=True)
        return None
    return days


async def daily_counts(
    start: dt.date, end: dt.date, campaign_name: str | None = None
) -> dict[dt.date, dict[str, int]] | None:
    """Per-day SES counts, or None when CloudWatch cannot be read."""
    creds = get_aws_credentials()
    region = (creds.region if creds else settings.AWS_REGION or "").strip()
    dimension = (campaign_name or (creds.cloudwatch_dimension_value if creds else "zozomarket")).strip()
    key = (start.isoformat(), end.isoformat(), region, dimension)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _TTL_SECONDS:
        return cached[1]
    data = await asyncio.to_thread(_fetch, start, end, campaign_name)
    if data is not None:
        _CACHE[key] = (now, data)
    return data
