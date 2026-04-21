import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def run_daily_sales_aggregation():
    logger.info("Starting daily sales aggregation task...")
    try:
        summary = await AnalyticsService.aggregate_daily_sales()
        logger.info(f"Daily sales aggregation completed for {summary.date}")
    except Exception as e:
        logger.error(f"Error during daily sales aggregation: {e}")

def start_scheduler():
    if not scheduler.running:
        # Run every day at 00:00
        scheduler.add_job(
            run_daily_sales_aggregation,
            CronTrigger(hour=0, minute=0),
            id="daily_sales_aggregation",
            replace_existing=True
        )
        scheduler.start()
        logger.info("Scheduler started. Daily sales aggregation scheduled for 00:00.")

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped.")
