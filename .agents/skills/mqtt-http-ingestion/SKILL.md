---
name: mqtt-http-ingestion
description: How to implement dual telemetry ingestion in PolyTrack via HTTP POST endpoints and MQTT subscriptions, including store-and-forward resilience.
---

# MQTT & HTTP Ingestion Skill

## Overview

PolyTrack accepts telemetry from GPS sources via two paths:
1. **HTTP POST** — Primary path; the simulator and hardware send JSON payloads to REST endpoints.
2. **MQTT** — Optional alternative; devices publish to an MQTT topic, and the backend subscribes.

Both paths validate, persist, and broadcast the data identically.

---

## Telemetry Payload Schema

Every telemetry message (HTTP or MQTT) uses this JSON format:

```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "latitude": 40.730610,
  "longitude": -73.935242,
  "altitude": 15.2,
  "speed": 8.5,
  "heading": 127.3,
  "recorded_at": "2026-03-15T20:30:00Z",
  "batch_id": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `device_id` | UUID | ✅ | Registered device identifier |
| `latitude` | float | ✅ | -90 to 90 |
| `longitude` | float | ✅ | -180 to 180 |
| `altitude` | float | ❌ | Meters above sea level |
| `speed` | float | ❌ | Meters per second |
| `heading` | float | ❌ | Degrees (0–359.99) |
| `recorded_at` | ISO 8601 | ✅ | GPS timestamp |
| `batch_id` | UUID | ❌ | Groups store-and-forward batches |

---

## HTTP POST Ingestion

### Single Point

```
POST /api/v1/telemetry
Content-Type: application/json
```

### Batch Upload (Store-and-Forward)

```
POST /api/v1/telemetry/batch
Content-Type: application/json
Body: [ ...array of telemetry payloads... ]
```

### FastAPI Endpoint Example

```python
@router.post("/", status_code=201)
async def ingest_telemetry(payload: TelemetryPayload, db=Depends(get_db)):
    point_id = await persist_telemetry(db, payload)
    await ws_manager.broadcast(payload.model_dump_json())
    return {"status": "success", "point_id": point_id}
```

---

## MQTT Ingestion (Optional)

### Topic Structure

```
polytrack/telemetry/{device_id}
```

Example: `polytrack/telemetry/550e8400-e29b-41d4-a716-446655440000`

### MQTT Subscriber (asyncio-mqtt)

```python
import asyncio
from aiomqtt import Client
from .config import settings

async def mqtt_subscriber():
    async with Client(settings.mqtt_broker_host, settings.mqtt_broker_port) as client:
        await client.subscribe(f"{settings.mqtt_topic_prefix}/#")
        async for message in client.messages:
            payload = TelemetryPayload.model_validate_json(message.payload)
            async with async_session() as db:
                await persist_telemetry(db, payload)
                await ws_manager.broadcast(payload.model_dump_json())
```

### Start MQTT listener on app startup

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    mqtt_task = asyncio.create_task(mqtt_subscriber())
    yield
    mqtt_task.cancel()
```

### Mosquitto Configuration (`mosquitto.conf`)

```
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
```

---

## Store-and-Forward (Client-Side)

The GPS source (simulator or hardware) implements resilience:

### Logic Flow

```
1. Poll GPS coordinates
2. Package as JSON payload
3. Try HTTP POST to /api/v1/telemetry
4. If network error:
   a. Cache payload locally (array / localStorage / EEPROM)
   b. Continue polling and caching
5. On network recovery:
   a. Batch-upload all cached payloads to /api/v1/telemetry/batch
   b. Assign a shared batch_id to the group
   c. Clear cache after successful upload
```

### JavaScript Simulator Example

```javascript
let offlineCache = [];

async function sendTelemetry(payload) {
  try {
    const res = await fetch('/api/v1/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // If we have cached data, flush it
    if (offlineCache.length > 0) {
      await flushCache();
    }
  } catch (err) {
    console.warn('Network error, caching locally:', err.message);
    offlineCache.push(payload);
    localStorage.setItem('telemetry_cache', JSON.stringify(offlineCache));
  }
}

async function flushCache() {
  const batchId = crypto.randomUUID();
  const batch = offlineCache.map(p => ({ ...p, batch_id: batchId }));

  const res = await fetch('/api/v1/telemetry/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (res.ok) {
    offlineCache = [];
    localStorage.removeItem('telemetry_cache');
    console.log(`Flushed ${batch.length} cached points`);
  }
}
```

---

## Rate Limiting Considerations

- Default simulator interval: **1 second** (1 Hz).
- Backend should handle bursts during batch uploads (store-and-forward flushes).
- Consider adding a simple rate limiter per `device_id` if needed to prevent abuse.