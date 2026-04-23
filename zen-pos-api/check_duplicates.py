
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.config import settings

async def check_duplicates():
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[DailySalesSummary]
    )
    
    pipeline = [
        {"$group": {"_id": "$date", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    duplicates = await DailySalesSummary.aggregate(pipeline).to_list()
    print(f"Found {len(duplicates)} dates with duplicates:")
    for d in duplicates:
        print(f"Date: {d['_id']}, Count: {d['count']}")

if __name__ == "__main__":
    asyncio.run(check_duplicates())
