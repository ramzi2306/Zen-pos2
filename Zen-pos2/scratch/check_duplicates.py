
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.config import settings

async def check_duplicates():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    
    summaries = await DailySalesSummary.find_all().to_list()
    print(f"Total summaries: {len(summaries)}")
    
    date_counts = {}
    for s in summaries:
        date_counts[s.date] = date_counts.get(s.date, 0) + 1
    
    duplicates = {d: c for d, c in date_counts.items() if c > 1}
    if duplicates:
        print("Duplicates found:")
        for d, c in duplicates.items():
            print(f"  {d}: {c} entries")
    else:
        print("No duplicates found in DB.")

if __name__ == "__main__":
    asyncio.run(check_duplicates())
