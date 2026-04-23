
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    summaries = await DailySalesSummary.find(DailySalesSummary.total_revenue > 1000).to_list()
    print(f"Summaries with revenue > 1000: {len(summaries)}")
    for s in summaries:
        print(f"  {s.date} | Revenue: {s.total_revenue}")

if __name__ == "__main__":
    asyncio.run(run())
