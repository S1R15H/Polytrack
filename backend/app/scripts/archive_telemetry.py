import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s"
)
logger = logging.getLogger("archive_telemetry")

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), '../../.env')
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Construct from components if DATABASE_URL is not set directly
    user = os.getenv("POSTGRES_USER", "polytrack")
    password = os.getenv("POSTGRES_PASSWORD", "polytrack123")
    db = os.getenv("POSTGRES_DB", "polytrack")
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    DATABASE_URL = f"postgresql://{user}:{password}@{host}:{port}/{db}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def archive_old_telemetry(days_old=7):
    """
    Archives telemetry points older than `days_old` into the archive table.
    Uses an explicit SQL transaction to prevent data loss.
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_old)
    logger.info(f"Starting archiving process for telemetry older than 7 days (Cutoff: {cutoff_date.isoformat()})")

    session = SessionLocal()
    try:
        # Step 1: Execute atomic INSERT ... SELECT inside the transaction
        insert_query = text("""
            INSERT INTO telemetry_points_archive (
                device_id, location, altitude, speed, heading, recorded_at, received_at, batch_id
            )
            SELECT 
                device_id, location, altitude, speed, heading, recorded_at, received_at, batch_id
            FROM telemetry_points
            WHERE recorded_at < :cutoff
        """)
        
        result_insert = session.execute(insert_query, {"cutoff": cutoff_date})
        rows_archived = result_insert.rowcount
        
        if rows_archived > 0:
            logger.info(f"Successfully copied {rows_archived} rows to telemetry_points_archive.")
            
            # Step 2: Delete archived rows from the primary table
            delete_query = text("""
                DELETE FROM telemetry_points
                WHERE recorded_at < :cutoff
            """)
            result_delete = session.execute(delete_query, {"cutoff": cutoff_date})
            rows_deleted = result_delete.rowcount
            
            if rows_deleted != rows_archived:
                logger.error(f"Mismatch: Copied {rows_archived} rows but deleted {rows_deleted} rows. Rolling back!")
                session.rollback()
                return
            
            # Step 3: Commit the transaction
            session.commit()
            logger.info(f"Transaction committed. {rows_deleted} rows safely deleted from primary live table.")
        else:
            logger.info("No records older than 7 days found. Nothing to archive.")
            session.rollback() # Safe
            
    except Exception as e:
        logger.error(f"Failed to archive telemetry data: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    archive_old_telemetry(days_old=7)
