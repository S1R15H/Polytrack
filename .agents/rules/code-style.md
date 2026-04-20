# Code Style Rules

> Hard rules enforced on every code change. No exceptions.

## Python / Backend

- FastAPI route handlers must **never contain business logic** — that lives in a service layer (`services/`).
- All functions that perform I/O (database, network, WebSocket) must use `async def`.
- All function signatures must have **type hints** on parameters and return types.
- No `print()` in production code — use `logging` module.
- Line length: **88 characters** max (Black formatter default).
- Imports grouped: stdlib → third-party → local, separated by blank lines.

## WebSocket

- All WebSocket message types must be defined as a **shared enum or constant**, not as raw strings scattered in the code.

```python
# ✅ Good
class WSMessageType:
    TELEMETRY_UPDATE = "telemetry_update"
    DEVICE_STATUS = "device_status"
    PING = "ping"

# ❌ Bad
await ws.send_text('{"type": "telemetry_update", ...}')
```

## Arduino / C++ (Phase 5)

- Arduino firmware must **never block** — use non-blocking patterns (millis-based timers, state machines) for cellular transmission.
- No `delay()` calls in the main loop.

## Frontend / JavaScript

- `const` over `let`; never `var`.
- All interactive elements must have unique, descriptive `id` attributes.
- WebSocket message parsing must handle unknown message types gracefully (log + ignore, don't crash).