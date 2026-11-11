"""IP-based rate limiting using FastAPI dependencies and `limits`."""

import math
import time
from typing import Any

from fastapi import Depends, Request
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter

from app.core.config import settings
from app.core.exceptions import RateLimitExceededError


class RateLimiter:
    """Rate limiter exposing FastAPI route dependencies (`dependencies=[limiter.limit(...)]`)."""

    def __init__(self, *, enabled: bool = True) -> None:
        self.enabled = enabled
        self._storage = MemoryStorage()
        self._limiter = FixedWindowRateLimiter(self._storage)

    def reset(self) -> None:
        self._storage.reset()

    def limit(self, rate: str) -> Any:
        item = parse(rate)

        def _check(request: Request) -> None:
            if not self.enabled:
                return
            client_ip = request.client.host if request.client else "unknown"
            scope = request.url.path
            if not self._limiter.hit(item, client_ip, scope):
                reset_time, _ = self._limiter.get_window_stats(item, client_ip, scope)
                retry_after = max(1, math.ceil(reset_time - time.time()))
                raise RateLimitExceededError(retry_after=retry_after)

        return Depends(_check)


limiter = RateLimiter(enabled=settings.ENVIRONMENT != "test")
