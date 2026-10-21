"""Delivery, open, and click totals from mail already accepted by Mailtrap."""

import asyncio
import datetime as dt
import logging
import time

import mailtrap as mt
from mailtrap.models.stats import StatsFilterParams

from app.core.config import settings

logger = logging.getLogger(__name__)

_CACHE: dict[tuple[str, str, str], tuple[float, dict[dt.date, dict[str, int]]]] = {}
_TTL_SECONDS = 60.0
_account_id: int | None = None
_account_known = False


def _token() -> str | None:
    value = settings.MAILTRAP_API_TOKEN
    if value is None:
        return None
    revealed = value.get_secret_value() if hasattr(value, "get_secret_value") else str(value)
    return revealed or None


def _resolve_account_id(token: str) -> int | None:
    global _account_id, _account_known
    if settings.MAILTRAP_ACCOUNT_ID:
        return settings.MAILTRAP_ACCOUNT_ID
    if _account_known:
        return _account_id
    accounts = mt.MailtrapClient(token=token).general_api.accounts.get_list()
    _account_id = accounts[0].id if accounts else None
    _account_known = True
    return _account_id


def _fetch(start: dt.date, end: dt.date) -> dict[dt.date, dict[str, int]] | None:
    token = _token()
    if settings.EMAIL_PROVIDER != "mailtrap" or not token:
        return None
    try:
        account_id = _resolve_account_id(token)
        if account_id is None:
            return None
        client = mt.MailtrapClient(token=token)
        groups = client.stats_api.by_date(
            account_id,
            StatsFilterParams(
                start_date=start.isoformat(),
                end_date=end.isoformat(),
                categories=[settings.MAILTRAP_CATEGORY] if settings.MAILTRAP_CATEGORY else None,
            ),
        )
    except Exception:
        logger.warning("Mailtrap stats unavailable", exc_info=True)
        return None
    days: dict[dt.date, dict[str, int]] = {}
    for group in groups:
        try:
            day = dt.date.fromisoformat(str(group.value)[:10])
        except ValueError:
            continue
        if day < start or day > end:
            continue
        delivered = int(group.stats.delivery_count)
        bounces = int(group.stats.bounce_count)
        days[day] = {
            "sent": delivered + bounces,
            "delivered": delivered,
            "opens": int(group.stats.open_count),
            "clicks": int(group.stats.click_count),
            "bounces": bounces,
            "unsubscribes": 0,
        }
    return days


async def daily_counts(start: dt.date, end: dt.date) -> dict[dt.date, dict[str, int]] | None:
    """Per-day Mailtrap counts, or None when this app is not sending through Mailtrap."""
    if settings.EMAIL_PROVIDER != "mailtrap" or not _token():
        return None
    key = (start.isoformat(), end.isoformat(), settings.MAILTRAP_CATEGORY)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _TTL_SECONDS:
        return cached[1]
    data = await asyncio.to_thread(_fetch, start, end)
    if data is not None:
        _CACHE[key] = (now, data)
    return data
