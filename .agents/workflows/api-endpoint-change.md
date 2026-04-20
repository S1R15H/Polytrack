---
description: How to modify or add API endpoints, ensuring consistent patterns, schema validation, and documentation updates.
---

# API Endpoint Change Workflow

## Steps

### 1. Design the Endpoint

Define before coding:

| Field | Example |
|-------|---------|
| Method + Path | `GET /api/v1/devices/{id}/history` |
| Request body (if POST/PUT) | `TelemetryPayload` schema |
| Response body | `{ status, data, message }` envelope |
| Status codes | `200`, `201`, `404`, `422` |
| Auth required? | No (MVP) / Yes (future) |

### 2. Write the Pydantic Schema First

Define request/response models in `models/schemas.py` before writing the route handler.

### 3. Write the Service Function

Business logic lives in `services/`, **not** in the route handler. The route handler should only:
1. Accept the request
2. Call the service function
3. Return the response

### 4. Write the Route Handler

```python
@router.get("/{device_id}/history", response_model=HistoryResponse)
async def get_device_history(device_id: UUID, db=Depends(get_db)):
    history = await history_service.get_history(db, device_id)
    return history
```

### 5. Update Documentation

- [ ] Update `fastapi-patterns.md/SKILL.md` if introducing a new pattern
- [ ] Update `ARCHITECTURE.md` if adding a major new resource
- [ ] Add `CHANGELOG.md` entry

### 6. Test

```bash
# Test with curl
curl http://localhost:8000/api/v1/devices/{id}/history | jq

# Check OpenAPI docs
open http://localhost:8000/docs
```
