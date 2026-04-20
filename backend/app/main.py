import time
import logging
import asyncio
from contextlib import asynccontextmanager

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.db.session import engine
from app.models.database import Base
from app.config import settings
from app.routers import telemetry, devices, health, routes, ai
from app.services.mqtt import mqtt_subscriber
from app.services.retention import cleanup_old_telemetry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("polytrack.access")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Background Tasks
    mqtt_task = asyncio.create_task(mqtt_subscriber())
    retention_task = asyncio.create_task(cleanup_old_telemetry())
    
    yield
    
    # Shutdown
    mqtt_task.cancel()
    retention_task.cancel()
    await engine.dispose()

app = FastAPI(title="PolyTrack API", lifespan=lifespan, root_path=os.getenv("FASTAPI_ROOT_PATH", ""))

# Issue #8: CORS middleware added FIRST, then logging middleware
# Starlette processes middleware in reverse order of addition,
# so adding CORS first ensures it wraps the logging middleware.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"{request.method} {request.url.path} - Status: {response.status_code} - {process_time:.4f}s")
    return response

app.include_router(telemetry.router)
app.include_router(devices.router)
app.include_router(health.router)
app.include_router(routes.router)
app.include_router(ai.router)
