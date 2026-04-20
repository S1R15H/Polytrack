import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
import json
import uuid

# We assume standard pytest-asyncio and an app fixture that connects to a test DB
from app.main import app
from app.models.schemas import TelemetryPayload
from app.services.ingestion import process_telemetry, process_telemetry_batch
from app.models.database import Base
from app.db.session import engine

# Fixtures for test setup would typically be here, e.g., creating the schema
# and returning a test client. For this codebase, let's mock the necessary components.

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

# Unit Test for the ingestion service (mocking the DB and WebSocket)
@pytest.mark.asyncio
async def test_process_telemetry_success(mocker):
    # Mock the DB session
    mock_db = mocker.AsyncMock()
    # Mock the persist_telemetry to return a fake point_id and timestamp
    fake_time = datetime.now(timezone.utc)
    mocker.patch('app.services.ingestion.persist_telemetry', return_value=(1, fake_time))
    
    # Mock the WebSocket manager broadcast
    mock_broadcast = mocker.patch('app.ws.manager.ConnectionManager.broadcast')
    
    payload = TelemetryPayload(
        device_id=str(uuid.uuid4()),
        latitude=40.7128,
        longitude=-74.0060,
        recorded_at=fake_time,
        altitude=10.5,
        speed=15.2,
        heading=90.0
    )
    
    resp_dict, status_code = await process_telemetry(mock_db, payload)
    
    # Verify success response
    assert status_code == 201
    assert resp_dict["point_id"] == 1
    
    # Verify WS broadcast was called EXACTLY ONCE, AFTER persistence
    mock_broadcast.assert_called_once()
    broadcasted_json = mock_broadcast.call_args[0][0]
    data = json.loads(broadcasted_json)
    assert data["latitude"] == 40.7128

@pytest.mark.asyncio
async def test_process_telemetry_db_failure(mocker):
    mock_db = mocker.AsyncMock()
    
    # Mock DB failure
    mocker.patch('app.services.ingestion.persist_telemetry', side_effect=Exception("DB Error"))
    # Mock DLQ writer
    mock_dlq = mocker.patch('app.services.ingestion._write_to_dlq')
    mock_broadcast = mocker.patch('app.ws.manager.ConnectionManager.broadcast')
    
    payload = TelemetryPayload(
        device_id=str(uuid.uuid4()),
        latitude=40.0,
        longitude=-74.0,
        recorded_at=datetime.now(timezone.utc)
    )
    
    resp_dict, status_code = await process_telemetry(mock_db, payload)
    
    # Verify we get the 202 Accepted fallback
    assert status_code == 202
    assert resp_dict["point_id"] == 0
    
    # Verify data was written to DLQ
    mock_dlq.assert_called_once()
    
    # Verify WS broadcast was NOT called due to persistence failure
    mock_broadcast.assert_not_called()
