
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.order import OrderDocument
from datetime import datetime, timezone

async def check_db(db_name):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    try:
        await init_beanie(database=client[db_name], document_models=[OrderDocument])
        start = datetime(2026, 4, 1, tzinfo=timezone.utc)
        count = await OrderDocument.find(OrderDocument.created_at >= start).count()
        print(f"Orders in April in {db_name}: {count}")
    except Exception as e:
        print(f"Error checking {db_name}: {e}")

async def run():
    for db in ['digital_store', 'dmc_database', 'zen_pos', 'zenpos']:
        await check_db(db)

if __name__ == "__main__":
    asyncio.run(run())
