import pytest
from pydantic import ValidationError
from datetime import datetime, timezone
import uuid
from app.models.schemas import TelemetryPayload

def test_telemetry_payload_valid():
    payload = TelemetryPayload(
        device_id=uuid.uuid4(),
        latitude=40.730610,
        longitude=-73.935242,
        recorded_at=datetime.now(timezone.utc)
    )
    assert payload.latitude == 40.730610
    assert payload.longitude == -73.935242

def test_telemetry_payload_invalid_latitude():
    with pytest.raises(ValidationError):
        TelemetryPayload(
            device_id=uuid.uuid4(),
            latitude=95.0, # Invalid (> 90)
            longitude=-73.935242,
            recorded_at=datetime.now(timezone.utc)
        )

def test_telemetry_payload_invalid_longitude():
    with pytest.raises(ValidationError):
        TelemetryPayload(
            device_id=uuid.uuid4(),
            latitude=40.730610,
            longitude=-185.0, # Invalid (< -180)
            recorded_at=datetime.now(timezone.utc)
        )

def test_telemetry_payload_invalid_heading():
    with pytest.raises(ValidationError):
        TelemetryPayload(
            device_id=uuid.uuid4(),
            latitude=40.730610,
            longitude=-73.935242,
            heading=400.0, # Invalid (>= 360)
            recorded_at=datetime.now(timezone.utc)
        )
