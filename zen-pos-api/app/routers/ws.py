"""
WebSocket router — /ws/notifications
Clients authenticate by passing ?token=<access_token> as a query param
(Authorization header is not available for WebSocket in browsers).
"""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.security import decode_token
from app.ws.manager import manager

router = APIRouter()


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
        # Keep connection alive — server pushes only, clients don't send data
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
