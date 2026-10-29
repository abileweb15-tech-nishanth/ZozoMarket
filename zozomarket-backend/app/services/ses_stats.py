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

logger = logging.getLogger(__name__)

# SES metric name -> the counter the dashboard and analytics already use.
_METRIC_KEYS = {
    "Send": "sent",
    "Delivery": "delivered",
    "Open": "opens",
    "Click": "clicks",
    "Bounce": "bounces",
}
_CACHE: dict[tuple[str, str, str], tuple[float, dict[dt.date, dict[str, int]]]] = {}
_TTL_SECONDS = 60.0


def _secret(value: object) -> str:
    if value is None:
        return ""
    revealed = value.get_secret_value() if hasattr(value, "get_secret_value") else str(value)
    return revealed or ""


def _blank() -> dict[str, int]:
    return {"sent": 0, "delivered": 0, "opens": 0, "clicks": 0, "bounces": 0, "unsubscribes": 0}


def _fetch(start: dt.date, end: dt.date) -> dict[dt.date, dict[str, int]] | None:
    access_key = (settings.AWS_ACCESS_KEY_ID or "").strip()
    secret_key = _secret(settings.AWS_SECRET_ACCESS_KEY)
    dimension = (settings.SES_CLOUDWATCH_DIMENSION_NAME or "").strip()
    dimension_value = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
    if not access_key or not secret_key or not dimension or not dimension_value:
        return None

    # EndTime is exclusive, so include the whole of `end`.
    start_at = dt.datetime.combine(start, dt.time.min, tzinfo=dt.UTC)
    end_at = dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, tzinfo=dt.UTC)
    dimensions = [{"Name": dimension, "Value": dimension_value}]
    days: dict[dt.date, dict[str, int]] = {}
    try:
        client = boto3.client(
            "cloudwatch",
            region_name=settings.AWS_REGION,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
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
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        logger.warning("SES CloudWatch stats unavailable (%s)", code)
        return None
    except Exception:
        logger.warning("SES CloudWatch stats unavailable", exc_info=True)
        return None
    return days


async def daily_counts(start: dt.date, end: dt.date) -> dict[dt.date, dict[str, int]] | None:
    """Per-day SES counts, or None when CloudWatch cannot be read."""
    dimension = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
    key = (start.isoformat(), end.isoformat(), dimension)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _TTL_SECONDS:
        return cached[1]
    data = await asyncio.to_thread(_fetch, start, end)
    if data is not None:
        _CACHE[key] = (now, data)
    return data
