
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def check_all_duplicates():
    client = AsyncIOMotorClient(settings.mongo_url)
    db = client[settings.mongo_db_name]
    collection = db["daily_sales_summaries"]
    
    pipeline = [
        {"$group": {"_id": "$date", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    duplicates = await collection.aggregate(pipeline).to_list(length=100)
    print(f"Found {len(duplicates)} dates with duplicate records.")
    for d in duplicates:
        print(f"Date: {d['_id']}, Count: {d['count']}")

if __name__ == "__main__":
    asyncio.run(check_all_duplicates())
