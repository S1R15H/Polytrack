---
name: fastapi-patterns
description: FastAPI development patterns for the PolyTrack telemetry backend — routing, models, async DB, WebSocket, and middleware.
---

# FastAPI Patterns Skill

## Overview

The PolyTrack backend is a FastAPI application that handles telemetry ingestion (HTTP/MQTT), persists data to PostGIS, and broadcasts updates via WebSocket. This skill documents the patterns and conventions to follow.

---

## Project Structure

```
backend/app/
├── main.py          # FastAPI app factory, middleware, startup/shutdown
├── config.py        # Pydantic BaseSettings for env vars
├── models/
│   ├── database.py  # SQLAlchemy models (Device, TelemetryPoint)
│   └── schemas.py   # Pydantic request/response schemas
├── routers/
│   ├── telemetry.py # POST /telemetry, GET /telemetry/history
│   ├── devices.py   # CRUD for devices
│   └── health.py    # GET /health
├── services/
│   ├── ingestion.py # Validate + persist + broadcast logic
│   └── ai.py        # AskAI service (Phase 4)
├── ws/
│   └── manager.py   # WebSocket connection manager
└── db/
    ├── session.py   # Async engine + session factory
    └── migrations/  # Alembic migrations
```

---

## App Configuration (Pydantic Settings)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str
    mqtt_broker_host: str = "mqtt"
    mqtt_broker_port: int = 1883
    ws_heartbeat_interval_seconds: int = 30
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## Router Pattern

```python
from fastapi import APIRouter, Depends, HTTPException
from ..models.schemas import TelemetryPayload, TelemetryResponse
from ..services.ingestion import process_telemetry
from ..db.session import get_db

router = APIRouter(prefix="/api/v1/telemetry", tags=["telemetry"])

@router.post("/", response_model=TelemetryResponse, status_code=201)
async def ingest_telemetry(
    payload: TelemetryPayload,
    db=Depends(get_db),
):
    """Validate and persist a single telemetry point, then broadcast via WS."""
    result = await process_telemetry(db, payload)
    return result

@router.post("/batch", status_code=201)
async def ingest_batch(
    payloads: list[TelemetryPayload],
    db=Depends(get_db),
):
    """Accept a batch of cached telemetry points (store-and-forward)."""
    results = [await process_telemetry(db, p) for p in payloads]
    return {"status": "success", "count": len(results)}
```

---

## Pydantic Schemas

```python
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID

class TelemetryPayload(BaseModel):
    device_id: UUID
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float | None = None
    speed: float | None = None
    heading: float | None = Field(None, ge=0, lt=360)
    recorded_at: datetime
    batch_id: UUID | None = None

class TelemetryResponse(BaseModel):
    status: str = "success"
    point_id: int
    received_at: datetime
```

---

## Async Database Session

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from .config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        yield session
```

---

## WebSocket Endpoint

```python
from fastapi import WebSocket, WebSocketDisconnect
from ..ws.manager import ws_manager

@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; client sends pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
```

---

## Middleware Checklist

1. **CORS** — Allow frontend origins via `CORSMiddleware`.
2. **Request Logging** — Log method, path, status, and duration.
3. **Exception Handlers** — Global handler to return consistent JSON error envelope.

---

## Startup / Shutdown Events

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables, connect MQTT
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: close connections
    await engine.dispose()

app = FastAPI(title="PolyTrack API", lifespan=lifespan)
```