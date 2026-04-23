
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["dmc_database"]
    collections = await db.list_collection_names()
    print(f"Collections in dmc_database: {collections}")
    for coll in collections:
        count = await db[coll].count_documents({})
        print(f"  {coll}: {count} docs")

if __name__ == "__main__":
    asyncio.run(run())
