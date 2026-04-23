
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    summaries = await DailySalesSummary.find_all().to_list()
    for s in summaries:
        if "22" in s.date:
            print(f"Date: {repr(s.date)} | ID: {s.id}")

if __name__ == "__main__":
    asyncio.run(run())
