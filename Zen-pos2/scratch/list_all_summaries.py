
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    summaries = await DailySalesSummary.find_all().sort(+DailySalesSummary.date).to_list()
    for s in summaries:
        print(f"{s.date} | {s.id}")

if __name__ == "__main__":
    asyncio.run(run())
