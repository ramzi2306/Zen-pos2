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

async def process_recurring_expenses():
    from datetime import date
    from app.models.expense import ManualExpenseDocument
    from app.routers.expenses import _next_occurrence

    logger.info("Processing recurring expenses...")
    try:
        today = date.today().isoformat()
        due = await ManualExpenseDocument.find(
            ManualExpenseDocument.is_recurring == True,
            ManualExpenseDocument.is_paused == False,
            ManualExpenseDocument.next_occurrence <= today
        ).to_list()

        for template in due:
            new_exp = ManualExpenseDocument(
                category=template.category,
                title=template.title,
                amount=template.amount,
                date=template.next_occurrence,
                notes=template.notes,
                is_recurring=True,
                frequency=template.frequency,
                next_occurrence=_next_occurrence(template.next_occurrence, template.frequency),
            )
            await new_exp.insert()
            template.next_occurrence = new_exp.next_occurrence
            await template.save()
            logger.info(f"Recurring expense '{template.title}' spawned for {new_exp.date}")
    except Exception as e:
        logger.error(f"Error processing recurring expenses: {e}")


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
        scheduler.add_job(
            process_recurring_expenses,
            CronTrigger(hour=1, minute=0),
            id="process_recurring_expenses",
            replace_existing=True
        )
        scheduler.start()
        logger.info("Scheduler started.")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped.")
