
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.order import OrderDocument

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    try:
        await init_beanie(database=client["dmc_database"], document_models=[OrderDocument])
        orders = await OrderDocument.find_all().to_list()
        print(f"Orders in dmc_database: {len(orders)}")
    except:
        print("Error checking dmc_database")

if __name__ == "__main__":
    asyncio.run(run())
