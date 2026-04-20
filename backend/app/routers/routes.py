from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.db.session import get_db
from app.models.database import SavedRoute
from app.models.schemas import SavedRouteCreate, SavedRouteResponse

router = APIRouter(
    prefix="/api/routes",
    tags=["Routes"]
)

@router.post("/save", response_model=SavedRouteResponse)
async def save_route(route_data: SavedRouteCreate, db: AsyncSession = Depends(get_db)):
    db_route = SavedRoute(**route_data.model_dump())
    db.add(db_route)
    await db.commit()
    await db.refresh(db_route)
    return db_route

@router.get("/saved", response_model=List[SavedRouteResponse])
async def get_saved_routes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SavedRoute).order_by(SavedRoute.created_at.desc()))
    return result.scalars().all()

@router.delete("/{route_id}")
async def delete_saved_route(route_id: str, db: AsyncSession = Depends(get_db)):
    try:
        valid_uuid = UUID(route_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed UUID provided")

    result = await db.execute(select(SavedRoute).where(SavedRoute.id == valid_uuid))
    db_route = result.scalar_one_or_none()
    
    if not db_route:
        raise HTTPException(status_code=404, detail="Saved route not found")
        
    await db.delete(db_route)
    await db.commit()
    return {"status": "success", "message": "Route deleted successfully"}
