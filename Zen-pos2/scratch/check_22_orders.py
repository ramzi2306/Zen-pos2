
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.order import OrderDocument

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[OrderDocument])
    orders = await OrderDocument.find(
        OrderDocument.created_at >= "2026-04-22T00:00:00Z",
        OrderDocument.created_at <= "2026-04-22T23:59:59Z"
    ).to_list()
    print(f"Orders on 2026-04-22: {len(orders)}")

if __name__ == "__main__":
    asyncio.run(run())
