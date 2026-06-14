"""
WebSocket connection manager — identical to rentline/backend version.
"""
import asyncio
import json
import time
import logging
from typing import Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)

_main_loop: Optional[asyncio.AbstractEventLoop] = None


def _capture_loop() -> None:
    global _main_loop
    try:
        _main_loop = asyncio.get_running_loop()
    except RuntimeError:
        pass


class ConnectionManager:
    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        _capture_loop()
        await ws.accept()
        self._connections.add(ws)
        logger.debug(f"WS connect — {len(self._connections)} active")

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.debug(f"WS disconnect — {len(self._connections)} active")

    async def broadcast(self, event: str, data: dict | None = None) -> None:
        if not self._connections:
            return
        message = json.dumps({
            "event": event,
            "data": data or {},
            "ts": int(time.time() * 1000),
        })
        dead: set[WebSocket] = set()
        for ws in list(self._connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


def broadcast_sync(event: str, data: dict | None = None) -> None:
    loop = _main_loop
    if loop is None or not loop.is_running():
        return
    try:
        asyncio.run_coroutine_threadsafe(manager.broadcast(event, data), loop)
    except Exception:
        pass
