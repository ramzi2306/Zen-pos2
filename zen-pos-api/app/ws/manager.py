import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # General connections (all staff/admin)
        self._connections: List[WebSocket] = []
        # Topic-based connections (e.g. "order_T123" -> [ws1, ws2])
        self._topics: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, topic: str = None) -> None:
        await websocket.accept()
        async with self._lock:
            if topic:
                if topic not in self._topics:
                    self._topics[topic] = set()
                self._topics[topic].add(websocket)
            else:
                self._connections.append(websocket)

    async def disconnect(self, websocket: WebSocket, topic: str = None) -> None:
        async with self._lock:
            if topic and topic in self._topics:
                try:
                    self._topics[topic].remove(websocket)
                except KeyError:
                    pass
            
            try:
                self._connections.remove(websocket)
            except ValueError:
                pass

    async def broadcast(self, event_type: str, data: dict[str, Any], topic: str = None) -> None:
        payload = json.dumps({
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data,
        })

        async with self._lock:
            # Send to general listeners AND topic-specific listeners
            targets = list(self._connections)
            if topic and topic in self._topics:
                # Merge unique connections
                targets.extend([ws for ws in self._topics[topic] if ws not in self._connections])

        if not targets:
            return

        dead: List[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self._connections:
                        self._connections.remove(ws)
                    for t in list(self._topics.keys()):
                        if ws in self._topics[t]:
                            self._topics[t].remove(ws)


# Module-level singleton
manager = ConnectionManager()
