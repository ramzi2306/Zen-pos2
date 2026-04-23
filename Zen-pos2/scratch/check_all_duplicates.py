
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def check_duplicates(db_name):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    try:
        await init_beanie(database=client[db_name], document_models=[DailySalesSummary])
        pipeline = [
            {"$group": {"_id": "$date", "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}}
        ]
        duplicates = await DailySalesSummary.aggregate(pipeline).to_list()
        if duplicates:
            print(f"Duplicates in {db_name}:")
            for d in duplicates:
                print(f"  Date: {d['_id']}, Count: {d['count']}")
        else:
            print(f"No duplicates in {db_name}")
    except Exception as e:
        print(f"Error checking {db_name}: {e}")

async def run():
    for db in ['digital_store', 'dmc_database', 'zen_pos', 'zenpos']:
        await check_duplicates(db)

if __name__ == "__main__":
    asyncio.run(run())
