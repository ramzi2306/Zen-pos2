
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.config import settings

async def list_all():
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[DailySalesSummary]
    )
    
    summaries = await DailySalesSummary.find_all().to_list()
    print(f"Total entries: {len(summaries)}")
    for s in summaries:
        print(f"Date: {s.date}, Income: {s.total_revenue}")

if __name__ == "__main__":
    asyncio.run(list_all())
