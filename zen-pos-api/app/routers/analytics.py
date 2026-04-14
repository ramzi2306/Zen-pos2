from typing import List
from collections import Counter
from datetime import datetime, timezone

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


@router.get("/bestsellers", response_model=List[BestsellerItem],
            dependencies=[Depends(require_permission("view_orders"))])
async def bestsellers(limit: int = 5):
    start = _start_of_month()
    orders = await OrderDocument.find(
        OrderDocument.status != "Cancelled",
        OrderDocument.created_at >= start,
    ).to_list()

    product_qty: Counter = Counter()
    product_rev: dict = {}
    for order in orders:
        for item in order.items:
            product_qty[item.product_name] += item.quantity
            product_rev[item.product_name] = product_rev.get(item.product_name, 0.0) + (item.unit_price * item.quantity)

    top = product_qty.most_common(limit)
    return [
        BestsellerItem(
            product_name=name,
            total_quantity=qty,
            total_revenue=round(product_rev.get(name, 0.0), 2),
        )
        for name, qty in top
    ]


@router.get("/leaderboard", response_model=List[LeaderboardEntry],
            dependencies=[Depends(require_permission("view_orders"))])
async def kitchen_leaderboard():
    start = _start_of_month()
    try:
        orders = await OrderDocument.find(
            OrderDocument.status == "Done",
            OrderDocument.created_at >= start,
        ).to_list()
    except Exception:
        return []

    cook_counts: Counter = Counter()
    for order in orders:
        try:
            if order.cook and hasattr(order.cook, "ref") and order.cook.ref:
                cook_id = str(order.cook.ref.id)
                cook_counts[cook_id] += 1
            elif order.cook and isinstance(order.cook, str):
                cook_counts[order.cook] += 1
        except Exception:
            continue

    if not cook_counts:
        return []

    # Batch-fetch all cooks in a single query instead of N individual lookups
    ranked = cook_counts.most_common()
    try:
        object_ids = [PydanticObjectId(uid) for uid, _ in ranked]
        users_list = await UserDocument.find(In(UserDocument.id, object_ids)).to_list()
        user_map = {str(u.id): u for u in users_list}
    except Exception:
        user_map = {}

    entries = []
    for rank, (cook_id, count) in enumerate(ranked, start=1):
        user = user_map.get(cook_id)
        entries.append(LeaderboardEntry(
            user_id=cook_id,
            name=user.name if user else "Unknown",
            avatar=getattr(user, "image", "") or "",
            orders_completed=count,
            rank=rank,
        ))
    return entries


@router.get("/summary", response_model=SalesSummary,
            dependencies=[Depends(require_permission("view_orders"))])
async def sales_summary():
    start = _start_of_month()
    # Aggregation pipeline — DB does the maths, never loads all orders into memory
    pipeline = [
        {"$match": {"status": {"$ne": "Cancelled"}}},
        {"$group": {
            "_id": None,
            "total_orders": {"$sum": 1},
            "total_revenue": {"$sum": "$total"},
            "month_orders": {
                "$sum": {"$cond": [{"$gte": ["$created_at", start]}, 1, 0]},
            },
            "month_revenue": {
                "$sum": {"$cond": [{"$gte": ["$created_at", start]}, "$total", 0]},
            },
        }},
    ]
    results = await OrderDocument.aggregate(pipeline).to_list()
    if not results:
        return SalesSummary(
            total_orders=0, total_revenue=0.0, avg_order_value=0.0,
            orders_this_month=0, revenue_this_month=0.0,
        )
    r = results[0]
    total_orders = r.get("total_orders", 0)
    total_rev = float(r.get("total_revenue", 0.0))
    return SalesSummary(
        total_orders=total_orders,
        total_revenue=round(total_rev, 2),
        avg_order_value=round(total_rev / total_orders, 2) if total_orders else 0.0,
        orders_this_month=r.get("month_orders", 0),
        revenue_this_month=round(float(r.get("month_revenue", 0.0)), 2),
    )
