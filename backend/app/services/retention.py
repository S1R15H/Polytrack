import asyncio
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import delete
from app.db.session import async_session
from app.models.database import TelemetryPoint
from app.config import settings

logger = logging.getLogger("polytrack.retention")

async def cleanup_old_telemetry():
    """Background task to periodically delete telemetry points older than the retention period."""
    retention_days = settings.telemetry_retention_days
    interval_hours = settings.telemetry_retention_interval_hours
    
    if retention_days <= 0:
        logger.info("Telemetry retention policy is disabled (retention_days <= 0).")
        return

    logger.info(f"Starting telemetry retention task. Deleting data older than {retention_days} days every {interval_hours} hours.")

    while True:
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
            
            async with async_session() as session:
                async with session.begin():
                    # Execute the delete query
                    stmt = delete(TelemetryPoint).where(TelemetryPoint.recorded_at < cutoff_date)
                    result = await session.execute(stmt)
                    deleted_count = result.rowcount
                    
            if deleted_count > 0:
                logger.info(f"Retention policy applied: deleted {deleted_count} old telemetry points from before {cutoff_date.isoformat()}.")
            else:
                logger.debug("Retention policy checked: no old telemetry points found to delete.")

        except asyncio.CancelledError:
            logger.info("Telemetry retention task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error executing telemetry retention cleanup: {e}", exc_info=True)
        
        # Sleep for the configured interval before running again
        await asyncio.sleep(interval_hours * 3600)
