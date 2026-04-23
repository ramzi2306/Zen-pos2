from typing import List
from collections import Counter
from datetime import datetime, timezone, timedelta

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import require_permission
from app.models.order import OrderDocument
from app.models.user import UserDocument

router = APIRouter()


def _start_of_month() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


class BestsellerItem(BaseModel):
    product_name: str
    total_quantity: int
    total_revenue: float


class LeaderboardEntry(BaseModel):
    user_id: str
    name: str
    avatar: str
    orders_completed: int
    rank: int


class SalesSummary(BaseModel):
    total_orders: int
    total_revenue: float
    avg_order_value: float
    orders_this_month: int
    revenue_this_month: float

class DailySalesItem(BaseModel):
    date: str
    income: float
    order_count: int
    avg_prep_time_minutes: int


@router.get("/bestsellers", response_model=List[BestsellerItem],
            dependencies=[Depends(require_permission("view_orders"))])
async def bestsellers(limit: int = 5):
    start = _start_of_month()
    pipeline = [
        {"$match": {
            "status": {"$ne": "Cancelled"},
            "created_at": {"$gte": start}
        }},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_name",
            "total_quantity": {"$sum": "$items.quantity"},
            "total_revenue": {"$sum": {"$multiply": ["$items.unit_price", "$items.quantity"]}}
        }},
        {"$sort": {"total_quantity": -1}},
        {"$limit": limit}
    ]
    
    results = await OrderDocument.aggregate(pipeline).to_list()
    return [
        BestsellerItem(
            product_name=r["_id"],
            total_quantity=r["total_quantity"],
            total_revenue=round(r["total_revenue"], 2),
        )
        for r in results
    ]


@router.get("/leaderboard", response_model=List[LeaderboardEntry],
            dependencies=[Depends(require_permission("view_orders"))])
async def kitchen_leaderboard():
    start = _start_of_month()
    pipeline = [
        {"$match": {
            "status": "Done",
            "created_at": {"$gte": start},
            "cook": {"$ne": None}
        }},
        {"$group": {
            "_id": "$cook",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    
    results = await OrderDocument.aggregate(pipeline).to_list()
    if not results:
        return []

    # results["_id"] are DBRefs (Beanie links)
    cook_ids = []
    counts_map = {}
    for r in results:
        # Extract ID from DBRef or direct string/ObjectId
        cid = r["_id"]
        if hasattr(cid, "id"):
            cid_str = str(cid.id)
        elif isinstance(cid, dict) and "$id" in cid:
            cid_str = str(cid["$id"])
        else:
            cid_str = str(cid)
        
        cook_ids.append(cid_str)
        counts_map[cid_str] = r["count"]

    # Batch fetch users
    try:
        object_ids = [PydanticObjectId(uid) for uid in cook_ids]
        users_list = await UserDocument.find(In(UserDocument.id, object_ids)).to_list()
        user_map = {str(u.id): u for u in users_list}
    except Exception:
        user_map = {}

    entries = []
    for rank, cid in enumerate(cook_ids, start=1):
        user = user_map.get(cid)
        entries.append(LeaderboardEntry(
            user_id=cid,
            name=user.name if user else "Unknown",
            avatar=getattr(user, "image", "") or "",
            orders_completed=counts_map[cid],
            rank=rank,
        ))
    return entries


@router.get("/summary", response_model=SalesSummary,
            dependencies=[Depends(require_permission("view_orders"))])
async def sales_summary():
    start_of_month = _start_of_month()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 1. Get historical sums from DailySalesSummary
    hist_pipeline = [
        {"$group": {
            "_id": None,
            "total_orders": {"$sum": "$order_count"},
            "total_revenue": {"$sum": "$total_revenue"},
            "month_orders": {
                "$sum": {"$cond": [{"$gte": ["$date", start_of_month.strftime("%Y-%m-%d")]}, "$order_count", 0]}
            },
            "month_revenue": {
                "$sum": {"$cond": [{"$gte": ["$date", start_of_month.strftime("%Y-%m-%d")]}, "$total_revenue", 0]}
            },
        }}
    ]
    from app.models.daily_sales import DailySalesSummary
    hist_results = await DailySalesSummary.aggregate(hist_pipeline).to_list()
    h = hist_results[0] if hist_results else {"total_orders": 0, "total_revenue": 0.0, "month_orders": 0, "month_revenue": 0.0}

    # 2. Get today's data from OrderDocument
    today_pipeline = [
        {"$match": {
            "status": {"$ne": "Cancelled"},
            "created_at": {"$gte": today_start}
        }},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "revenue": {"$sum": "$total"}
        }}
    ]
    today_results = await OrderDocument.aggregate(today_pipeline).to_list()
    t = today_results[0] if today_results else {"count": 0, "revenue": 0.0}

    total_orders = h["total_orders"] + t["count"]
    total_rev = h["total_revenue"] + t["revenue"]
    month_orders = h["month_orders"] + t["count"]
    month_rev = h["month_revenue"] + t["revenue"]

    return SalesSummary(
        total_orders=total_orders,
        total_revenue=round(total_rev, 2),
        avg_order_value=round(total_rev / total_orders, 2) if total_orders else 0.0,
        orders_this_month=month_orders,
        revenue_this_month=round(month_rev, 2),
    )


@router.get("/daily", response_model=List[DailySalesItem],
            dependencies=[Depends(require_permission("view_orders"))])
async def daily_sales(start_date: str, end_date: str):
    from app.services.analytics_service import AnalyticsService
    summaries = await AnalyticsService.get_daily_summaries(start_date, end_date)

    results = [
        DailySalesItem(
            date=s.date,
            income=s.total_revenue,
            order_count=s.order_count,
            avg_prep_time_minutes=round(s.total_prep_time_ms / s.prep_count / 60000) if s.prep_count > 0 else 0
        )
        for s in summaries
    ]

    # If end_date includes today, compute today's data live from orders
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if end_date >= today_str:
        # Always compute today live to ensure real-time accuracy
        try:
            day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            
            from beanie.operators import Or
            orders = await OrderDocument.find(
                OrderDocument.status != "Cancelled",
                Or(
                    OrderDocument.payment_status == "Paid",
                    OrderDocument.status == "Done"
                ),
                OrderDocument.created_at >= day_start,
                OrderDocument.created_at < day_end
            ).to_list()
            
            total_revenue = sum(o.total for o in orders)
            order_count = len(orders)
            
            today_prep_ms = 0
            today_prep_count = 0
            for o in orders:
                if o.start_time and o.end_time:
                    today_prep_ms += (o.end_time - o.start_time)
                    today_prep_count += 1
            
            results.append(DailySalesItem(
                date=today_str,
                income=round(total_revenue, 2),
                order_count=order_count,
                avg_prep_time_minutes=round(today_prep_ms / today_prep_count / 60000) if today_prep_count > 0 else 0
            ))
        except Exception as e:
            import logging
            logging.error(f"Error computing live sales: {e}")

    # Deduplicate results by date (favoring later entries if duplicates exist)
    unique_results = {}
    for item in results:
        unique_results[item.date] = item
    
    return sorted(unique_results.values(), key=lambda x: x.date)
