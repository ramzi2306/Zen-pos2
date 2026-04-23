
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def check_date():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    
    summaries = await DailySalesSummary.find(DailySalesSummary.date >= "2026-04-01").sort(+DailySalesSummary.date).to_list()
    print(f"Summaries count: {len(summaries)}")
    for s in summaries:
        print(f"  Date: {s.date}, ID: {s.id}, Revenue: {s.total_revenue}")

if __name__ == "__main__":
    asyncio.run(check_date())
