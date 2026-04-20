from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.schemas import TelemetryPayload, TelemetryResponse
from app.services.ingestion import process_telemetry, process_telemetry_batch
from app.db.session import get_db
from app.ws.manager import ws_manager

router = APIRouter(tags=["telemetry"])

# Issue #1: Router now controls the HTTP status code from the service tuple
@router.post("/api/v1/telemetry", responses={201: {"model": TelemetryResponse}, 202: {"model": TelemetryResponse}})
async def ingest_telemetry_single(payload: TelemetryPayload, db: AsyncSession = Depends(get_db)):
    result, status = await process_telemetry(db, payload)
    return JSONResponse(content=result, status_code=status)

@router.post("/api/v1/telemetry/batch", responses={201: {}, 202: {}})
async def ingest_telemetry_batch(payloads: list[TelemetryPayload], db: AsyncSession = Depends(get_db)):
    result, status = await process_telemetry_batch(db, payloads)
    return JSONResponse(content=result, status_code=status)

@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if '"ping"' in data:
                await websocket.send_text('{"type": "pong"}')
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error in telemetry stream: {e}", exc_info=True)
    finally:
        ws_manager.disconnect(websocket)
