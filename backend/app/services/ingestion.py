from datetime import datetime, timezone
import json
import logging
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import insert
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
import aiofiles
from app.models.schemas import TelemetryPayload, TelemetryResponse
from app.models.database import TelemetryPoint
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

# Issue #2: Fixed return type annotation (was -> int, actually returns tuple)
async def persist_telemetry(db: AsyncSession, payload: TelemetryPayload) -> tuple[int | None, datetime | None]:
    stmt = insert(TelemetryPoint).values(
        device_id=payload.device_id,
        location=ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326),
        altitude=payload.altitude,
        speed=payload.speed,
        heading=payload.heading,
        recorded_at=payload.recorded_at,
        batch_id=payload.batch_id
    ).returning(TelemetryPoint.id, TelemetryPoint.received_at)
    result = await db.execute(stmt)
    await db.commit()
    row = result.fetchone()
    return (row[0], row[1]) if row else (None, None)

async def persist_telemetry_batch(db: AsyncSession, payloads: list[TelemetryPayload]) -> list[int]:
    if not payloads:
        return []
    values = [
        {
            "device_id": p.device_id,
            "location": ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326),
            "altitude": p.altitude,
            "speed": p.speed,
            "heading": p.heading,
            "recorded_at": p.recorded_at,
            "batch_id": p.batch_id
        } for p in payloads
    ]
    stmt = insert(TelemetryPoint).values(values).returning(TelemetryPoint.id)
    result = await db.execute(stmt)
    await db.commit()
    return list(result.scalars().all())


async def _write_to_dlq(payload_data: dict, error: Exception) -> None:
    """Write failed telemetry to a dead-letter-queue file, keeping it under 10MB."""
    dlq_entry = {
        "error": str(error),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload_data
    }
    
    dlq_dir = os.environ.get("DLQ_DIR", "/app/data/dlq")
    os.makedirs(dlq_dir, exist_ok=True)
    dlq_path = os.path.join(dlq_dir, "dead_letter.jsonl")
    try:
        # Check size and rotate if > 10MB
        if os.path.exists(dlq_path) and os.path.getsize(dlq_path) > 10 * 1024 * 1024:
            rotated_path = os.path.join(dlq_dir, f"dead_letter_{int(datetime.now().timestamp())}.jsonl")
            os.rename(dlq_path, rotated_path)
            
        async with aiofiles.open(dlq_path, mode="a") as f:
            await f.write(json.dumps(dlq_entry, default=str) + "\n")
    except Exception as dlq_e:
        logger.error(f"Failed to write to DLQ: {dlq_e}")


# Issue #1: Fixed — always returns tuple[dict, int], router controls status code
async def process_telemetry(db: AsyncSession, payload: TelemetryPayload) -> tuple[dict, int]:
    try:
        point_id, received_at = await persist_telemetry(db, payload)
        
        if received_at is None:
            received_at = datetime.now(timezone.utc)
            
        # Issue #2: Broadcast AFTER persistence to avoid phantom data
        await ws_manager.broadcast(payload.model_dump_json())
        return TelemetryResponse(point_id=point_id or 0, received_at=received_at).model_dump(mode='json'), 201
        
    except IntegrityError as e:
        logger.error(f"Validation failed for telemetry (likely invalid device_id): {e}")
        return {"status": "error", "detail": f"Device {payload.device_id} is invalid or not found"}, 400
    except Exception as e:
        logger.error(f"Failed to persist telemetry: {e}")
        await _write_to_dlq(payload.model_dump(), e)
        return TelemetryResponse(point_id=0, received_at=datetime.now(timezone.utc)).model_dump(mode='json'), 202


# Issue #5: Fixed — added try/except + DLQ fallback for batch endpoint
async def process_telemetry_batch(db: AsyncSession, payloads: list[TelemetryPayload]) -> tuple[dict, int]:
    try:
        point_ids = await persist_telemetry_batch(db, payloads)
        if payloads:
            batch_json = "[" + ",".join([p.model_dump_json() for p in payloads]) + "]"
            await ws_manager.broadcast(batch_json)
        return {"status": "success", "count": len(point_ids)}, 201
    except Exception as e:
        logger.error(f"Failed to persist telemetry batch: {e}")
        for p in payloads:
            await _write_to_dlq(p.model_dump(), e)
        return {"status": "partial", "count": 0, "error": "Persistence failed, data queued to DLQ"}, 202
