"""
WebSocket router — /ws/notifications
Clients authenticate by passing ?token=<access_token> as a query param
(Authorization header is not available for WebSocket in browsers).

Keep-alive strategy
-------------------
The frontend sends a plain "ping" text every 25 s.  We receive it here,
ignore it, and loop back.  This prevents Traefik / Nginx idle-connection
timeouts (typically 60 s) from dropping the socket without the client
knowing.  The server also sends its own `{"type":"ping"}` every 30 s so
the proxy sees bidirectional traffic — some proxies only reset the timer
on egress data.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.security import decode_token
from app.ws.manager import manager

router = APIRouter()

_PING_INTERVAL = 30  # seconds between server-sent pings


@router.websocket("/ws/notifications")
async def ws_notifications(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    # Authenticate before accepting the connection
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise JWTError("not an access token")
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket)
    try:
        while True:
            try:
                # Wait up to _PING_INTERVAL seconds for a client message (e.g. "ping").
                # If we time out, send a server-side ping to keep the proxy alive.
                await asyncio.wait_for(websocket.receive_text(), timeout=_PING_INTERVAL)
                # Received something from the client — just ignore it and loop back.
            except asyncio.TimeoutError:
                # No client message within the window — send our own keepalive.
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break  # connection is dead; fall through to disconnect
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
