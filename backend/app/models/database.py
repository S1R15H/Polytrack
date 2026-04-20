from sqlalchemy import Column, BigInteger, Float, DateTime, ForeignKey, Boolean, String, Index
from sqlalchemy.orm import declarative_base
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from sqlalchemy.sql import func
import uuid

Base = declarative_base()

class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    device_type = Column(String(50), nullable=False, default="simulator")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

class TelemetryPoint(Base):
    __tablename__ = "telemetry_points"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id"), nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=False)
    altitude = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    batch_id = Column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index('ix_telemetry_device_id', 'device_id'),
        Index('ix_telemetry_recorded_at', 'recorded_at'),
    )

class TelemetryPointArchive(Base):
    __tablename__ = "telemetry_points_archive"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id"), nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=False)
    altitude = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    batch_id = Column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index('ix_telemetry_archive_device_id', 'device_id'),
        Index('ix_telemetry_archive_recorded_at', 'recorded_at'),
    )

class SavedRoute(Base):
    __tablename__ = "saved_routes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    origin_name = Column(String, nullable=False)
    destination_name = Column(String, nullable=False)
    origin_lat = Column(Float, nullable=False)
    origin_lng = Column(Float, nullable=False)
    dest_lat = Column(Float, nullable=False)
    dest_lng = Column(Float, nullable=False)
    mode = Column(String(20), nullable=False, default="drive")
    distance = Column(String(50), nullable=False)
    duration = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
