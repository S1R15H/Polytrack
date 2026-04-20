from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.schemas import DeviceCreate, DeviceResponse
from app.models.database import Device
from app.db.session import get_db
from uuid import UUID

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])

@router.post("/", response_model=DeviceResponse, status_code=201)
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)):
    device = Device(name=payload.name)
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device

@router.get("/", response_model=list[DeviceResponse])
async def list_devices(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Device).offset(skip).limit(limit))
    return result.scalars().all()

@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device
