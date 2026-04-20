---
description: How to update the frontend map integration when the tracking UI, markers, or map behavior need to change.
---

# Frontend Map Change Workflow

## Steps

### 1. Identify the Change Type

| Type | Examples |
|------|----------|
| **Marker update** | New marker style, rotation, animation |
| **Layer change** | Add/remove route polyline, geofence overlay |
| **Interaction** | New popup content, click handler, tooltip |
| **Data source** | New API endpoint, changed WS message format |
| **Responsive** | Layout changes for mobile vs desktop |

### 2. Check Upstream Dependencies

- If the change depends on **new data from the API** → verify the endpoint exists and returns the needed fields
- If the change depends on **new WebSocket fields** → follow the [WebSocket Change Workflow](file:///Users/sirishgurung/Desktop/PolyTrack/.agents/workflows/websocket-change.md) first

### 3. Implementation Notes

- Keep marker/layer IDs deterministic and unique (e.g., `vehicle-marker-{device_id}`)
- Use the dead reckoning interpolation function for marker position updates — never call `setLngLat()` directly for live updates
- Test both dispatcher (desktop) and rider (mobile) views

### 4. Verify

- [ ] Map loads without console errors
- [ ] Markers update smoothly on WebSocket messages
- [ ] Route polylines render correctly from history data
- [ ] Responsive breakpoints work (desktop sidebar + mobile full-screen)
- [ ] Update `leaflet/SKILL.md` if introducing a new pattern
