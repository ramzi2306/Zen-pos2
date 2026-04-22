import asyncio
from app.database import connect_db
from app.models.daily_sales import DailySalesSummary
from app.services.analytics_service import AnalyticsService
from datetime import datetime, timedelta, timezone
import logging

logging.basicConfig(level=logging.INFO)

async def redo_backfill():
    await connect_db()
    logging.info("Wiping DailySalesSummary collection...")
    await DailySalesSummary.delete_all()
    
    logging.info("Running 90-day backfill with updated logic...")
    for i in range(90, 0, -1):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        await AnalyticsService.aggregate_daily_sales(day)
    
    logging.info("Backfill complete.")

if __name__ == "__main__":
    asyncio.run(redo_backfill())
