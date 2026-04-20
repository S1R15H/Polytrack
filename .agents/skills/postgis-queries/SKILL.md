---
name: postgis-queries
description: PostGIS spatial queries and patterns for PolyTrack telemetry — schema setup, common queries, indexing, and performance tuning.
---

# PostGIS Queries Skill

## Overview

PolyTrack uses PostgreSQL with the PostGIS extension to store and query spatial telemetry data. All coordinates use **SRID 4326** (WGS 84 — standard GPS coordinate system).

---

## Enable PostGIS

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

> The `postgis/postgis` Docker image enables this automatically.

---

## Schema Setup

### Devices Table

```sql
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL DEFAULT 'simulator',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Telemetry Points Table

```sql
CREATE TABLE telemetry_points (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id),
    location GEOMETRY(POINT, 4326) NOT NULL,
    altitude FLOAT,
    speed FLOAT,
    heading FLOAT,
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id UUID
);

-- Spatial index for location queries
CREATE INDEX idx_telemetry_location ON telemetry_points USING GIST (location);

-- Composite index for device history queries
CREATE INDEX idx_telemetry_device_time ON telemetry_points (device_id, recorded_at DESC);
```

### Geofences Table (Phase 3+)

```sql
CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    boundary GEOMETRY(POLYGON, 4326) NOT NULL,
    alert_on_enter BOOLEAN DEFAULT true,
    alert_on_exit BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_geofences_boundary ON geofences USING GIST (boundary);
```

---

## Inserting Telemetry Points

```sql
INSERT INTO telemetry_points (device_id, location, altitude, speed, heading, recorded_at, batch_id)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    ST_SetSRID(ST_MakePoint(-73.935242, 40.730610), 4326),  -- lng, lat
    15.2,
    8.5,
    127.3,
    '2026-03-15T20:30:00Z',
    NULL
);
```

> **Important:** `ST_MakePoint(longitude, latitude)` — longitude first!

---

## Common Queries

### Latest Position per Device

```sql
SELECT DISTINCT ON (device_id)
    device_id,
    ST_X(location) AS longitude,
    ST_Y(location) AS latitude,
    speed,
    heading,
    recorded_at
FROM telemetry_points
ORDER BY device_id, recorded_at DESC;
```

### Device Route History (as LineString)

```sql
SELECT ST_AsGeoJSON(
    ST_MakeLine(location ORDER BY recorded_at)
) AS route_geojson
FROM telemetry_points
WHERE device_id = $1
  AND recorded_at BETWEEN $2 AND $3;
```

### Distance Between Two Points

```sql
SELECT ST_Distance(
    ST_SetSRID(ST_MakePoint(-73.935, 40.730), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-73.940, 40.735), 4326)::geography
) AS distance_meters;
```

> Cast to `::geography` for distance in **meters**. Without the cast, `ST_Distance` returns degrees.

### Devices Within Radius

```sql
SELECT d.id, d.name,
       ST_X(tp.location) AS lng, ST_Y(tp.location) AS lat
FROM devices d
JOIN LATERAL (
    SELECT location FROM telemetry_points
    WHERE device_id = d.id
    ORDER BY recorded_at DESC LIMIT 1
) tp ON true
WHERE ST_DWithin(
    tp.location::geography,
    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
    $3  -- radius in meters
);
```

### Geofence Check (Is Device Inside?)

```sql
SELECT g.id, g.name
FROM geofences g
WHERE ST_Within(
    ST_SetSRID(ST_MakePoint($1, $2), 4326),  -- device lng, lat
    g.boundary
);
```

### Telemetry Points Within a Geofence

```sql
SELECT tp.*, ST_X(tp.location) AS lng, ST_Y(tp.location) AS lat
FROM telemetry_points tp
JOIN geofences g ON ST_Within(tp.location, g.boundary)
WHERE g.id = $1
ORDER BY tp.recorded_at DESC
LIMIT 100;
```

---

## Indexing Strategy

| Index Type | Column | Use Case |
|------------|--------|----------|
| **GIST** | `telemetry_points.location` | Spatial queries (ST_DWithin, ST_Within) |
| **GIST** | `geofences.boundary` | Geofence containment checks |
| **B-Tree** | `(device_id, recorded_at DESC)` | Device history lookups |

---

## Performance Tips

1. **Use `::geography`** for distance calculations in meters; otherwise PostGIS uses planar math on degree values.
2. **Partition `telemetry_points`** by time range (e.g., monthly) once data volume grows.
3. **Limit history queries** with time bounds (`WHERE recorded_at BETWEEN ...`) to keep scans bounded.
4. **Vacuum and analyze** regularly: `VACUUM ANALYZE telemetry_points;`
5. **Use `ST_DWithin`** instead of `ST_Distance < X` — it leverages the GIST index.

---

## SQLAlchemy + GeoAlchemy2 Pattern

```python
from geoalchemy2 import Geometry
from sqlalchemy import Column, BigInteger, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

class TelemetryPoint(Base):
    __tablename__ = "telemetry_points"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id"), nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=False)
    altitude = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default="now()")
    batch_id = Column(UUID(as_uuid=True), nullable=True)
```