---
description: How to implement a new feature in PolyTrack, ensuring the correct layer and payload contracts are handled first.
---

# New Feature Workflow

## Pre-Code Checklist

Before writing any code, complete these steps in order:

### 1. Identify the Affected Layer(s)

Determine which layer(s) the feature touches:

| Layer | Scope |
|-------|-------|
| **Hardware** | Arduino firmware, GPS polling, cellular transmission |
| **Backend** | FastAPI endpoints, services, database models, WebSocket |
| **Frontend** | Map UI, dashboard, WebSocket client, components |

Mark all layers that will be modified. If multiple layers are affected, work **bottom-up** (hardware → backend → frontend).

### 2. Check Payload Schema Impact

Ask: **Does this feature change the telemetry JSON payload?**

- Adding a new field (e.g., `battery_level`)?
- Changing a field type or constraint?
- Adding a new message type over WebSocket?

**If YES** → You MUST update `mqtt-http-ingestion/SKILL.md` first:
1. Update the payload schema table
2. Update the Pydantic model example
3. Update the MQTT topic structure if a new message type is added
4. Then proceed to code changes

**If NO** → Proceed directly.

### 3. Check Database Schema Impact

Ask: **Does this feature require new tables or columns?**

**If YES** → Follow the [Database Migration Workflow](file:///Users/sirishgurung/Desktop/PolyTrack/.agents/workflows/database-migration.md) before writing application code.

### 4. Implementation Order

```
1. Update skill docs / schema docs (if affected)
2. Write database migration (if needed)
3. Implement backend changes (models → services → routers)
4. Implement frontend changes (API client → components → views)
5. Update TODO.md — check off the completed item
6. Update CHANGELOG.md — add entry under [Unreleased]
```

### 5. Post-Implementation

- [ ] Run the backend with `docker compose up` and verify no startup errors
- [ ] Test the new endpoint(s) with `curl` or the simulator
- [ ] Verify WebSocket clients still receive updates without errors
- [ ] Commit with a conventional commit message: `feat(scope): description`
