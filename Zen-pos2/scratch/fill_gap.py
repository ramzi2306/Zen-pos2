
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.services.analytics_service import AnalyticsService
from datetime import datetime, timezone, timedelta

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    from app.models.daily_sales import DailySalesSummary
    from app.models.order import OrderDocument
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary, OrderDocument])
    
    # Aggregate for 22 April
    day_22 = datetime(2026, 4, 22, tzinfo=timezone.utc)
    print(f"Aggregating for {day_22.strftime('%Y-%m-%d')}...")
    summary = await AnalyticsService.aggregate_daily_sales(day_22)
    print(f"Created/Updated summary for {summary.date}: Revenue={summary.total_revenue}, Orders={summary.order_count}")

    # Aggregate for 23 April (today)
    day_23 = datetime(2026, 4, 23, tzinfo=timezone.utc)
    print(f"Aggregating for {day_23.strftime('%Y-%m-%d')}...")
    summary = await AnalyticsService.aggregate_daily_sales(day_23)
    print(f"Created/Updated summary for {summary.date}: Revenue={summary.total_revenue}, Orders={summary.order_count}")

if __name__ == "__main__":
    asyncio.run(run())
