
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.order import OrderDocument

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[OrderDocument])
    orders = await OrderDocument.find(OrderDocument.created_at >= "2026-04-01").to_list()
    print(f"Orders in April in zenpos: {len(orders)}")
    for o in orders:
        print(f"  {o.created_at} | Total: {o.total} | Status: {o.status}")

if __name__ == "__main__":
    asyncio.run(run())
