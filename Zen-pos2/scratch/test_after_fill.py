
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.routers.analytics import daily_sales
from datetime import datetime, timezone

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    from app.models.daily_sales import DailySalesSummary
    from app.models.order import OrderDocument
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary, OrderDocument])
    
    # Test for this month
    res = await daily_sales("2026-04-01", "2026-04-30")
    dates = [r.date for r in res]
    print(f"Total items: {len(dates)}")
    print(f"Latest dates: {dates[-5:]}")
    
    # Check for duplicates
    from collections import Counter
    counts = Counter(dates)
    dupes = {d: c for d, c in counts.items() if c > 1}
    if dupes:
        print(f"Found duplicates: {dupes}")
    else:
        print("No duplicates found!")

if __name__ == "__main__":
    asyncio.run(run())
