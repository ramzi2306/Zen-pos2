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

async def detect_orphaned_sessions():
    from datetime import datetime, timedelta, timezone
    from app.models.register import RegisterSessionDocument
    
    logger.info("Checking for orphaned register sessions...")
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        orphaned = await RegisterSessionDocument.find(
            RegisterSessionDocument.status == "OPEN",
            RegisterSessionDocument.last_activity_at < cutoff,
            RegisterSessionDocument.is_stale == False
        ).to_list()
        
        for session in orphaned:
            session.is_stale = True
            await session.save()
            logger.warning(f"Session {session.id} marked as STALE")
            # In a real app, send a notification to manager here
    except Exception as e:
        logger.error(f"Error checking orphaned sessions: {e}")

def start_scheduler():
    if not scheduler.running:
        # Run every day at 00:00
        scheduler.add_job(
            run_daily_sales_aggregation,
            CronTrigger(hour=0, minute=0),
            id="daily_sales_aggregation",
            replace_existing=True
        )
        # Run every 30 minutes
        scheduler.add_job(
            detect_orphaned_sessions,
            CronTrigger(minute="0,30"),
            id="detect_orphaned_sessions",
            replace_existing=True
        )
        scheduler.start()
        logger.info("Scheduler started. Daily sales aggregation and orphan detection scheduled.")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped.")
