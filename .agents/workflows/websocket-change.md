---
description: How to safely modify WebSocket endpoints or message contracts without breaking the frontend-backend connection.
---

# WebSocket Change Workflow

WebSocket changes are a common source of silent breakage — the server sends a new format, the client ignores unknown fields or crashes on missing ones. **Always check both sides.**

## Steps

### 1. Document the Current Message Contract

Before making changes, confirm the current WebSocket message format by checking:
- `websocket-client/SKILL.md` — server-side broadcast format
- Frontend WebSocket handler — `onMessage` parsing logic

### 2. Define the New Contract

Write down the **before** and **after** message format:

```
BEFORE: { device_id, latitude, longitude, speed, heading, recorded_at }
AFTER:  { device_id, latitude, longitude, speed, heading, recorded_at, battery_level }
```

### 3. Check Both Sides Simultaneously

| Change | Server (`ws/manager.py`) | Client (JS `onMessage`) |
|--------|--------------------------|-------------------------|
| New field added | ✅ Include in broadcast | ✅ Handle or gracefully ignore |
| Field renamed | ✅ Update broadcast | ✅ Update parsing |
| Field removed | ✅ Stop sending | ✅ Remove dependency |
| New message type | ✅ Add broadcast logic | ✅ Add handler with type check |

### 4. Ensure Backward Compatibility

- **Adding fields** is safe — old clients ignore unknown fields.
- **Removing or renaming fields** is breaking — update client FIRST or deploy simultaneously.
- If breaking changes are unavoidable, add a `"type"` or `"version"` field to messages:
  ```json
  { "type": "telemetry_update", "version": 2, "data": { ... } }
  ```

### 5. Update Documentation

- [ ] Update `websocket-client/SKILL.md` with the new message format
- [ ] Update `mqtt-http-ingestion/SKILL.md` if the payload schema changed upstream
- [ ] Add a `CHANGELOG.md` entry

### 6. Test the Full Path

```
Ingest telemetry (HTTP/MQTT) → Verify WS broadcast format → Verify client parses correctly
```

Never test only the server or only the client in isolation.
