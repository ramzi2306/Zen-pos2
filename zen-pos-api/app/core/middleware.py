import time
import logging
from typing import Callable

logger = logging.getLogger("zenpos.access")


class LoggingMiddleware:
    """Pure-ASGI logging middleware — avoids BaseHTTPMiddleware's TaskGroup
    which conflicts with Motor's event-loop binding on Python < 3.10."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "%s %s → %d  (%.1fms)",
                scope.get("method", ""),
                scope.get("path", ""),
                status_code,
                duration_ms,
            )
