import asyncio
import logging
from aiomqtt import Client
from app.config import settings
from app.models.schemas import TelemetryPayload
from app.services.ingestion import process_telemetry
from app.db.session import async_session

logger = logging.getLogger(__name__)

async def mqtt_subscriber(session_factory=async_session):
    while True:
        try:
            async with Client(settings.mqtt_broker_host, settings.mqtt_broker_port) as client:
                await client.subscribe("polytrack/telemetry/#")
                logger.info("Connected to MQTT broker and subscribed to polytrack/telemetry/#")
                async for message in client.messages:
                    try:
                        payload = TelemetryPayload.model_validate_json(message.payload)
                        async with session_factory() as db:
                            await process_telemetry(db, payload)
                    except Exception as e:
                        logger.error(f"Error processing MQTT message: {e}")
        except asyncio.CancelledError:
            logger.info("MQTT subscriber task cancelled, shutting down gracefully.")
            break
        except Exception as e:
            logger.error(f"MQTT connection failed or encountered an error, retrying in 5s: {e}")
            await asyncio.sleep(5)
