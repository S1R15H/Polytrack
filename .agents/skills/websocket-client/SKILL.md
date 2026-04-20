---
name: websocket-client
description: WebSocket gateway and client patterns for real-time telemetry broadcasting in PolyTrack.
---

# WebSocket Client Skill

## Overview

PolyTrack uses WebSocket to push validated telemetry updates from the FastAPI backend to all connected frontend clients in real time. This is the key mechanism for achieving sub-second latency.

---

## Architecture

```
FastAPI API receives telemetry (HTTP/MQTT)
    ↓ validate + persist
    ↓ broadcast via WebSocket
    ↓
Connected clients (Leaflet map, dashboard, mobile)
    ↓ update marker position
```

---

## Server-Side: Connection Manager

```python
# backend/app/ws/manager.py

from fastapi import WebSocket
import asyncio
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts telemetry updates."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WS connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WS disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        """Send a message to ALL connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def send_to_device_subscribers(self, device_id: str, message: str):
        """Send to clients subscribed to a specific device (future enhancement)."""
        # TODO: Implement per-device subscription filtering
        await self.broadcast(message)


# Singleton instance
ws_manager = ConnectionManager()
```

---

## Server-Side: WebSocket Endpoint

```python
# In backend/app/routers/telemetry.py (or a dedicated ws router)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..ws.manager import ws_manager

router = APIRouter()

@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Wait for client messages (pings / subscription requests)
            data = await websocket.receive_text()
            # Could handle subscription commands here:
            # e.g., {"action": "subscribe", "device_id": "..."}
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
```

---

## Broadcasting on Telemetry Ingestion

```python
# In backend/app/services/ingestion.py

from ..ws.manager import ws_manager

async def process_telemetry(db, payload: TelemetryPayload) -> int:
    # 1. Persist to PostGIS
    point_id = await insert_telemetry_point(db, payload)

    # 2. Immediately broadcast to all WS clients
    ws_message = payload.model_dump_json()
    await ws_manager.broadcast(ws_message)

    return point_id
```

---

## Client-Side: JavaScript WebSocket Connection

```javascript
class TelemetryWebSocket {
  constructor(url, onMessage) {
    this.url = url;
    this.onMessage = onMessage;
    this.ws = null;
    this.reconnectDelay = 1000;  // Start with 1s
    this.maxReconnectDelay = 30000;  // Cap at 30s
    this.heartbeatInterval = null;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectDelay = 1000;  // Reset on successful connect
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.onMessage(data);
    };

    this.ws.onclose = (event) => {
      console.warn('WebSocket closed:', event.code, event.reason);
      this.stopHeartbeat();
      this.reconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.ws.close();
    };
  }

  reconnect() {
    console.log(`Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => {
      this.connect();
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);  // Every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  close() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

---

## Usage Example

```javascript
// Connect to WebSocket and update map on each message
const wsUrl = `ws://${window.location.host}/ws/telemetry`;

const telemetryWs = new TelemetryWebSocket(wsUrl, (data) => {
  // data = { device_id, latitude, longitude, speed, heading, recorded_at }
  updateVehiclePosition(data.device_id, data.longitude, data.latitude, data.heading);
});
```

---

## Subscription Model (Future Enhancement)

For scaling to many devices, add per-device subscriptions:

### Client sends subscription
```json
{ "action": "subscribe", "device_id": "550e8400-..." }
```

### Server filters broadcasts
Only send messages to clients subscribed to that `device_id`.

---

## Key Design Decisions

1. **Broadcast-first, filter-later** — For MVP, broadcast all telemetry to all clients. Add subscription filtering when scaling.
2. **Exponential backoff reconnection** — Client reconnects with increasing delays to avoid thundering herd.
3. **Heartbeat keepalive** — Prevents idle connections from being dropped by proxies/load balancers.
4. **Graceful disconnect cleanup** — Server removes dead connections from the active list during broadcasts.