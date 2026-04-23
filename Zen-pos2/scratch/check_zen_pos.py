
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    # TRY zen_pos instead of zenpos
    await init_beanie(database=client["zen_pos"], document_models=[DailySalesSummary])
    summaries = await DailySalesSummary.find_all().sort(+DailySalesSummary.date).to_list()
    print(f"Summaries in zen_pos: {len(summaries)}")
    for s in summaries:
        if "2026-04" in s.date:
            print(f"  {s.date} | {s.id} | Revenue: {s.total_revenue}")

if __name__ == "__main__":
    asyncio.run(run())
