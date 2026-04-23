
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.order import OrderDocument
from datetime import datetime, timezone

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[OrderDocument])
    
    start = datetime(2026, 4, 22, 0, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 4, 22, 23, 59, 59, tzinfo=timezone.utc)
    
    orders = await OrderDocument.find(
        OrderDocument.created_at >= start,
        OrderDocument.created_at <= end
    ).to_list()
    print(f"Orders on 2026-04-22: {len(orders)}")
    for o in orders:
        print(f"  {o.order_number} | {o.total} | {o.status}")

if __name__ == "__main__":
    asyncio.run(run())
