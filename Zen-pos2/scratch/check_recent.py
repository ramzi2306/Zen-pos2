
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from datetime import datetime, timedelta, timezone

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    
    now = datetime.now(timezone.utc)
    for i in range(10, -1, -1):
        day = now - timedelta(days=i)
        date_str = day.strftime("%Y-%m-%d")
        summaries = await DailySalesSummary.find(DailySalesSummary.date == date_str).to_list()
        print(f"{date_str} | Count: {len(summaries)}")

if __name__ == "__main__":
    asyncio.run(run())
