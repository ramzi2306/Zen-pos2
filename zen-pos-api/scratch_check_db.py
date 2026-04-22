import asyncio
from app.database import connect_db
from app.models.order import OrderDocument
from app.models.daily_sales import DailySalesSummary

from datetime import datetime, timezone

async def check():
    await connect_db()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    print(f"Today Start (UTC): {today_start}")
    
    orders = await OrderDocument.find_all().to_list()
    print(f"Total Orders: {len(orders)}")
    
    for o in orders:
        print(f"Order {o.order_number}: Created {o.created_at} - Status: {o.status} - Total: {o.total}")
        if o.created_at >= today_start:
            print("  -> Counts as TODAY")
        else:
            print("  -> Counts as HISTORICAL")
    
    summary_count = await DailySalesSummary.count()
    print(f"Summary Records: {summary_count}")
    
    if summary_count > 0:
        mar24 = await DailySalesSummary.find_one(DailySalesSummary.date == "2026-03-24")
        if mar24:
            print(f"Summary 2026-03-24: Orders {mar24.order_count}, Revenue {mar24.total_revenue}")
        else:
            print("Summary 2026-03-24 NOT FOUND")
        
        latest = await DailySalesSummary.find().sort(-DailySalesSummary.date).first_or_none()
        print(f"Latest Summary: {latest.date} - Revenue: {latest.total_revenue}")

if __name__ == "__main__":
    asyncio.run(check())
