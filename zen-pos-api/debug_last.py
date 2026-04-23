
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.config import settings

async def debug_last_entries():
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[DailySalesSummary]
    )
    
    summaries = await DailySalesSummary.find_all().sort("-date").limit(10).to_list()
    print(f"Last 10 entries:")
    for s in summaries:
        print(f"Date: '{s.date}', Income: {s.total_revenue}, ID: {s.id}")

if __name__ == "__main__":
    asyncio.run(debug_last_entries())
