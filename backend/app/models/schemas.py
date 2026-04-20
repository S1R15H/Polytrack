from pydantic import BaseModel, Field, AwareDatetime, ConfigDict
from datetime import datetime
from uuid import UUID

class TelemetryPayload(BaseModel):
    device_id: UUID
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float | None = None
    speed: float | None = None
    heading: float | None = Field(None, ge=0, lt=360)
    recorded_at: AwareDatetime
    batch_id: UUID | None = None

class TelemetryResponse(BaseModel):
    status: str = "success"
    point_id: int
    received_at: AwareDatetime

class DeviceBase(BaseModel):
    name: str

class DeviceCreate(DeviceBase):
    pass

# Issue #17: Replaced deprecated class Config with model_config
class DeviceResponse(DeviceBase):
    id: UUID
    device_type: str
    is_active: bool
    created_at: AwareDatetime

    model_config = ConfigDict(from_attributes=True)

class SavedRouteBase(BaseModel):
    name: str
    origin_name: str
    destination_name: str
    origin_lat: float = Field(ge=-90, le=90)
    origin_lng: float = Field(ge=-180, le=180)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lng: float = Field(ge=-180, le=180)
    mode: str
    distance: str
    duration: str

class SavedRouteCreate(SavedRouteBase):
    pass

class SavedRouteResponse(SavedRouteBase):
    id: UUID
    created_at: AwareDatetime

    model_config = ConfigDict(from_attributes=True)

class AIChatRequest(BaseModel):
    message: str

class AIChatResponse(BaseModel):
    reply: str
