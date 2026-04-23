
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.order import OrderDocument
from app.config import settings
from datetime import datetime, timezone, timedelta

async def check_22_orders():
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[OrderDocument]
    )
    
    start_of_day = datetime(2026, 4, 22, tzinfo=timezone.utc)
    end_of_day = start_of_day + timedelta(days=1)
    
    orders = await OrderDocument.find(
        OrderDocument.created_at >= start_of_day,
        OrderDocument.created_at < end_of_day
    ).to_list()
    
    print(f"Found {len(orders)} orders for 2026-04-22")
    for o in orders:
        print(f"Order ID: {o.id}, Total: {o.total}, Status: {o.status}, Created: {o.created_at}")

if __name__ == "__main__":
    asyncio.run(check_22_orders())
