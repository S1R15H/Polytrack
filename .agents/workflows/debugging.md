---
description: How to debug issues in PolyTrack by systematically tracing the telemetry data flow from source to screen.
---

# Debugging Workflow

When something is broken, **do not jump to the layer you think is broken.** Trace the data flow in order.

## The Telemetry Data Pipeline

```
Hardware/Simulator → Ingestion Endpoint → Database Write → WebSocket Broadcast → Frontend Render
```

## Systematic Trace (Follow This Order)

### Step 1: Verify the GPS Source

**Is the simulator/hardware sending data at all?**

```bash
# Check simulator logs or network tab
# Verify payloads are being generated
curl -X POST http://localhost:8000/api/v1/telemetry \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test-uuid","latitude":40.73,"longitude":-73.93,"recorded_at":"2026-03-15T20:00:00Z"}'
```

- ✅ 201 response → source is fine, move to Step 2
- ❌ Connection refused → API is down, check Docker
- ❌ 422 error → payload format is wrong, check schema

### Step 2: Verify the Ingestion Endpoint

**Is the API receiving and processing the data?**

```bash
# Check API logs
docker compose logs -f api
```

Look for:
- Request received log entry
- Pydantic validation errors (422)
- Database connection errors

### Step 3: Verify the Database Write

**Is the data actually in PostGIS?**

```bash
docker compose exec db psql -U polytrack -d polytrack -c \
  "SELECT id, device_id, ST_AsText(location), recorded_at FROM telemetry_points ORDER BY received_at DESC LIMIT 5;"
```

- ✅ Rows returned → data is persisting, move to Step 4
- ❌ No rows → the INSERT is failing silently, check service logic

### Step 4: Verify the WebSocket Broadcast

**Is the server broadcasting to connected clients?**

```bash
# Quick test: connect with wscat
npx wscat -c ws://localhost:8000/ws/telemetry
```

Then send a telemetry point via HTTP. You should see the broadcast in the wscat terminal.

- ✅ Message received → broadcast is working, move to Step 5
- ❌ No message → check `ws_manager.broadcast()` is called after persist

### Step 5: Verify the Frontend Render

**Is the frontend receiving and rendering the data?**

- Open browser DevTools → Network → WS tab
- Check for incoming WebSocket messages
- Check the browser console for JavaScript errors
- Verify the map marker update function is being called

## Common Failure Points

| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| No data at all | Simulator not running or API is down | Step 1 |
| 422 errors | Payload schema mismatch | Pydantic model vs. sender format |
| Data in DB but no live updates | WebSocket broadcast not triggered | `ws_manager.broadcast()` call |
| WS messages received but map doesn't update | Frontend parsing error | `onMessage` handler + marker function |
| Marker jumps erratically | Frontend interpolation bug | Dead reckoning logic |
| Data gaps in history | Store-and-forward not flushing | Batch upload / cache logic |

## Debugging Checklist

- [ ] Step 1: GPS source sends valid JSON ✓/✗
- [ ] Step 2: API receives and validates ✓/✗
- [ ] Step 3: Data persists in PostGIS ✓/✗
- [ ] Step 4: WebSocket broadcasts message ✓/✗
- [ ] Step 5: Frontend renders update ✓/✗
