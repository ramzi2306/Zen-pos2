
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def check_23_summaries():
    client = AsyncIOMotorClient(settings.mongo_url)
    db = client[settings.mongo_db_name]
    collection = db["daily_sales_summaries"]
    
    docs = await collection.find({"date": "2026-04-23"}).to_list(length=100)
    print(f"Direct Mongo found {len(docs)} documents for 2026-04-23")
    for d in docs:
        print(f"Doc: {d}")

if __name__ == "__main__":
    asyncio.run(check_23_summaries())
