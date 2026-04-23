
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def list_all_summaries_detailed():
    client = AsyncIOMotorClient(settings.mongo_url)
    db = client[settings.mongo_db_name]
    collection = db["daily_sales_summaries"]
    
    docs = await collection.find({}).sort("date", -1).to_list(length=200)
    print(f"Total documents: {len(docs)}")
    for d in docs:
        print(f"ID: {d['_id']}, Date: {d['date']}, Income: {d.get('total_revenue')}")

if __name__ == "__main__":
    asyncio.run(list_all_summaries_detailed())
