import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import Document, init_beanie

class TestOrder(Document):
    status: str

async def main():
    try:
        print(TestOrder.status.nin(["A", "B"]))
    except Exception as e:
        print("ERROR:", e)

asyncio.run(main())
