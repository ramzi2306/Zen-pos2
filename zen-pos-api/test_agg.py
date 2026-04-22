import asyncio
from app.database import connect_db
from app.models.daily_sales import DailySalesSummary
from datetime import datetime, timezone

async def test_agg():
    await connect_db()
    hist_pipeline = [
        {"$group": {
            "_id": None,
            "total_orders": {"$sum": "$order_count"},
            "total_revenue": {"$sum": "$total_revenue"},
        }}
    ]
    results = await DailySalesSummary.aggregate(hist_pipeline).to_list()
    print(f"Aggregation Results: {results}")

if __name__ == "__main__":
    asyncio.run(test_agg())
