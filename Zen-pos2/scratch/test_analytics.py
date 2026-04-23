
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary
from app.models.order import OrderDocument
from app.models.user import UserDocument
from app.routers.analytics import daily_sales
from datetime import datetime, timezone

async def test_endpoint():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary, OrderDocument, UserDocument])
    
    # Simulate calling the endpoint for a range including 22 Apr 2026
    start_date = "2026-04-01"
    end_date = "2026-04-23" # Today
    
    results = await daily_sales(start_date, end_date)
    print(f"Results count: {len(results)}")
    
    for r in results:
        print(f"Date: {r.date}, Income: {r.income}")

if __name__ == "__main__":
    asyncio.run(test_endpoint())
