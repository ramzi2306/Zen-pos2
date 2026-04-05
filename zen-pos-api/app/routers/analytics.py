from typing import List
from collections import Counter
from datetime import datetime, timezone

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

    entries = []
    for rank, (cook_id, count) in enumerate(cook_counts.most_common(), start=1):
        try:
            user = await UserDocument.get(cook_id)
            entries.append(LeaderboardEntry(
                user_id=cook_id,
                name=user.full_name if user else "Unknown",
                avatar=getattr(user, "avatar", "") or "",
                orders_completed=count,
                rank=rank,
            ))
        except Exception:
            continue
    return entries


@router.get("/summary", response_model=SalesSummary,
            dependencies=[Depends(require_permission("view_orders"))])
async def sales_summary():
    start = _start_of_month()
    all_orders = await OrderDocument.find(
        OrderDocument.status != "Cancelled",
    ).to_list()
    month_orders = [o for o in all_orders if getattr(o, "created_at", None) and o.created_at >= start]

    total_rev = sum(o.total for o in all_orders)
    month_rev = sum(o.total for o in month_orders)

    return SalesSummary(
        total_orders=len(all_orders),
        total_revenue=round(total_rev, 2),
        avg_order_value=round(total_rev / len(all_orders), 2) if all_orders else 0.0,
        orders_this_month=len(month_orders),
        revenue_this_month=round(month_rev, 2),
    )
