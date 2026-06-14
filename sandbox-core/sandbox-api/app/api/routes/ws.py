"""
WebSocket endpoint — real-time push for payment and property events.

Endpoint:  ws://host/api/ws?token=<clerk_jwt>

Auth:      Clerk JWT passed as query parameter (standard for WebSocket).
           The token is verified once on connect; the connection is closed
           with code 4001 if invalid or expired.

Keepalive: Server sends {"event":"ping"} every 30 s.
           Client should respond with {"type":"pong"} (optional — the
           server does not enforce pong replies, only uses send failures
           to detect dead connections).

Events broadcast to clients:
  {"event": "payment.status_changed", "data": {"payment_id", "status", "property_id"}, "ts": ms}
  {"event": "payment.settled",        "data": {"payment_id", "tx_hash", "usdc_amount", "property_id"}, "ts": ms}
  {"event": "property.updated",       "data": {"property_id", "changed_fields": [...]}, "ts": ms}
  {"event": "ping",                   "data": {}, "ts": ms}
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.websockets import WebSocketState

from app.core.ws_manager import manager
from app.core.clerk_auth import verify_clerk_token

logger = logging.getLogger(__name__)

router = APIRouter()

PING_INTERVAL = 30  # seconds


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(..., description="Clerk JWT for authentication"),
):
    # ── Auth ────────────────────────────────────────────────────────────────
    try:
        claims = verify_clerk_token(token)
        user_id = claims.get("sub", "unknown")
    except Exception as e:
        logger.warning(f"WS auth failed: {e}")
        await ws.close(code=4001, reason="Unauthorized")
        return

    # ── Connect ─────────────────────────────────────────────────────────────
    await manager.connect(ws)
    logger.info(f"WS connected: user={user_id} total={manager.count}")

    # ── Ping task ────────────────────────────────────────────────────────────
    async def ping_loop():
        while ws.client_state == WebSocketState.CONNECTED:
            try:
                await asyncio.sleep(PING_INTERVAL)
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_json({"event": "ping", "data": {}, "ts": int(__import__("time").time() * 1000)})
            except Exception:
                break

    ping_task = asyncio.create_task(ping_loop())

    # ── Message loop ─────────────────────────────────────────────────────────
    try:
        while True:
            data = await ws.receive_text()
            # Only handle pong — ignore everything else
            # (future: could handle selective subscriptions here)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WS error for user={user_id}: {e}")
    finally:
        ping_task.cancel()
        manager.disconnect(ws)
        logger.info(f"WS disconnected: user={user_id} total={manager.count}")
