# Schema Rules

> Rules governing payload formats, database columns, and data contracts.

## Payload Contract

- **Never change a payload field name without updating both the firmware serializer AND the backend validator in the same change.** A mismatch will cause silent 422 rejections or data loss.
- Any new field added to the telemetry payload must be:
  1. Added to `mqtt-http-ingestion/SKILL.md` payload table
  2. Added to the Pydantic schema (`TelemetryPayload`)
  3. Added to the database migration (if persisted)
  4. Handled in the WebSocket broadcast (if forwarded)

## Geospatial

- **Always use SRID 4326** for all coordinate storage — never hardcode raw floats as plain `FLOAT` columns.
- Use `GEOMETRY(POINT, 4326)` for point data, `GEOMETRY(POLYGON, 4326)` for geofences.
- Remember: `ST_MakePoint(longitude, latitude)` — **longitude first**.

## Timestamps

- **Timestamp fields must always be UTC**, never local time.
- Use `TIMESTAMPTZ` in PostgreSQL, `datetime` with `timezone=True` in SQLAlchemy.
- The GPS source's `recorded_at` is the device-side timestamp; `received_at` is the server-side timestamp. Never conflate them.

## Naming

- Database tables: **plural snake_case** (`telemetry_points`, `devices`).
- JSON payload fields: **snake_case** (`device_id`, `recorded_at`).
- Never use camelCase in payloads or database — keep uniform snake_case end-to-end.