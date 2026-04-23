
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.config import settings

async def list_22_april():
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[DailySalesSummary]
    )
    
    summaries = await DailySalesSummary.find(DailySalesSummary.date == "2026-04-22").to_list()
    print(f"Found {len(summaries)} entries for 2026-04-22")
    for s in summaries:
        print(f"ID: {s.id}, Date: {s.date}, Income: {s.total_revenue}, Orders: {s.order_count}")

if __name__ == "__main__":
    asyncio.run(list_22_april())
