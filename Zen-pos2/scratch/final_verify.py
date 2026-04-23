
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.routers.analytics import daily_sales
from app.models.daily_sales import DailySalesSummary
from app.models.order import OrderDocument
from datetime import datetime, timezone

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos"], document_models=[DailySalesSummary, OrderDocument])
    
    # 1. Simulate having a duplicate in the DB (even though we have a unique index, let's see if our backend handles it)
    # Actually, we can't easily have a duplicate in the DB.
    # But we can simulate the backend adding a live record on top of a DB record.
    
    # 2. Call the endpoint
    res = await daily_sales("2026-04-01", "2026-04-30")
    
    # 3. Verify uniqueness
    dates = [r.date for r in res]
    from collections import Counter
    counts = Counter(dates)
    dupes = {d: c for d, c in counts.items() if c > 1}
    
    print(f"Result count: {len(res)}")
    if dupes:
        print(f"FAILED: Found duplicates: {dupes}")
    else:
        print("SUCCESS: No duplicates in response!")
    
    # 4. Verify today is present
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today_str in dates:
        print(f"SUCCESS: Today ({today_str}) is in the response.")
    else:
        print(f"FAILED: Today ({today_str}) is missing.")

if __name__ == "__main__":
    asyncio.run(run())
