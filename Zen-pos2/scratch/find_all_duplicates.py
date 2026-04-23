
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary])
    
    pipeline = [
        {"$group": {"_id": "$date", "count": {"$sum": 1}, "ids": {"$push": {"$toString": "$_id"}}}},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    duplicates = await DailySalesSummary.aggregate(pipeline).to_list()
    if duplicates:
        print("Found duplicates:")
        for d in duplicates:
            print(f"  Date: {d['_id']}, Count: {d['count']}, IDs: {d['ids']}")
    else:
        print("No duplicates found in the entire collection.")

if __name__ == "__main__":
    asyncio.run(run())
