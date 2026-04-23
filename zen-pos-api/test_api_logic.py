
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.models.order import OrderDocument
from app.config import settings
from datetime import datetime, timezone

async def test_api_logic():
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[DailySalesSummary, OrderDocument]
    )
    
    start_date = "2026-04-01"
    end_date = "2026-04-23"
    
    summaries = await DailySalesSummary.find(
        DailySalesSummary.date >= start_date,
        DailySalesSummary.date <= end_date
    ).sort(+DailySalesSummary.date).to_list()
    
    results = [s.date for s in summaries]
    print(f"Pre-aggregated dates: {results}")
    
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"Today is: {today_str}")
    
    if end_date >= today_str:
        if today_str not in results:
            print("Adding today live...")
            results.append(today_str)
            
    print(f"Final dates: {results}")

if __name__ == "__main__":
    asyncio.run(test_api_logic())
