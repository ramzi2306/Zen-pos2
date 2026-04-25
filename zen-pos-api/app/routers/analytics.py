from typing import List, Optional
from collections import Counter
from datetime import datetime, timezone, timedelta

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends, Query
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
    reviews_count: int
    reviews_avg_rating: float

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

    # Aggregate review data from all reviewed orders
    review_pipeline = [
        {"$match": {"review": {"$ne": None}, "review.stars": {"$exists": True}}},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "total_stars": {"$sum": "$review.stars"},
        }}
    ]
    review_results = await OrderDocument.aggregate(review_pipeline).to_list()
    rv = review_results[0] if review_results else {"count": 0, "total_stars": 0}
    reviews_count = rv["count"]
    reviews_avg = round(rv["total_stars"] / reviews_count, 2) if reviews_count else 0.0

    return SalesSummary(
        total_orders=total_orders,
        total_revenue=round(total_rev, 2),
        avg_order_value=round(total_rev / total_orders, 2) if total_orders else 0.0,
        orders_this_month=month_orders,
        revenue_this_month=round(month_rev, 2),
        reviews_count=reviews_count,
        reviews_avg_rating=reviews_avg,
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


# ── Finance Dashboard ─────────────────────────────────────

class FinanceDayItem(BaseModel):
    date: str
    income: float
    expenses: float
    profit: float


class PaymentMethodBreakdown(BaseModel):
    method: str
    amount: float
    count: int


class PurchaseItem(BaseModel):
    date: str
    ingredient: str
    vendor: str
    quantity: float
    unit: str
    cost: float


class SalaryItem(BaseModel):
    date: str
    user_name: str
    base_salary: float
    net_amount: float


class CashAdvanceItem(BaseModel):
    date: str
    user_name: str
    amount: float
    status: str


class ExpensesBreakdown(BaseModel):
    total: float
    purchases_total: float
    salaries_total: float
    cash_advances_total: float
    purchases: List[PurchaseItem]
    salaries: List[SalaryItem]
    cash_advances: List[CashAdvanceItem]


class FinanceReport(BaseModel):
    period_start: str
    period_end: str
    income_total: float
    income_order_count: int
    income_by_day: List[FinanceDayItem]
    income_by_payment_method: List[PaymentMethodBreakdown]
    expenses: ExpensesBreakdown
    profit: float
    profit_margin: float


@router.get("/finance", response_model=FinanceReport,
            dependencies=[Depends(require_permission("view_orders"))])
async def finance_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
):
    from app.models.ingredient import PurchaseLogDocument
    from app.models.payroll import PayrollWithdrawalDocument

    try:
        period_start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        period_end = datetime.strptime(end_date, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    # ── Income from orders ──────────────────────────────
    income_pipeline = [
        {"$match": {
            "status": {"$ne": "Cancelled"},
            "payment_status": "Paid",
            "created_at": {"$gte": period_start, "$lte": period_end},
        }},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "method": "$payment_method",
            },
            "revenue": {"$sum": "$total"},
            "count": {"$sum": 1},
        }},
    ]
    income_raw = await OrderDocument.aggregate(income_pipeline).to_list()

    income_by_day: dict[str, float] = {}
    method_totals: dict[str, dict] = {}
    income_total = 0.0
    income_order_count = 0

    for r in income_raw:
        date = r["_id"]["date"]
        method = r["_id"]["method"] or "Other"
        rev = r["revenue"]
        cnt = r["count"]

        income_by_day[date] = income_by_day.get(date, 0.0) + rev
        income_total += rev
        income_order_count += cnt

        if method not in method_totals:
            method_totals[method] = {"amount": 0.0, "count": 0}
        method_totals[method]["amount"] += rev
        method_totals[method]["count"] += cnt

    # ── Purchases ───────────────────────────────────────
    purchases_raw = await PurchaseLogDocument.find(
        PurchaseLogDocument.date >= start_date,
        PurchaseLogDocument.date <= end_date,
    ).to_list()

    await PurchaseLogDocument.fetch_all_links()

    purchases_list: List[PurchaseItem] = []
    purchases_by_day: dict[str, float] = {}
    purchases_total = 0.0

    for p in purchases_raw:
        try:
            await p.fetch_all_links()
        except Exception:
            pass
        ing_name = p.ingredient.name if hasattr(p.ingredient, "name") else "Unknown"
        purchases_list.append(PurchaseItem(
            date=p.date,
            ingredient=ing_name,
            vendor=p.vendor or "",
            quantity=p.quantity,
            unit=p.unit,
            cost=p.total_cost,
        ))
        purchases_by_day[p.date] = purchases_by_day.get(p.date, 0.0) + p.total_cost
        purchases_total += p.total_cost

    # ── Salary payments ─────────────────────────────────
    salary_pipeline = [
        {"$match": {
            "date": {"$gte": start_date, "$lte": end_date},
        }},
        {"$lookup": {
            "from": "users",
            "localField": "user.$id",
            "foreignField": "_id",
            "as": "user_doc",
        }},
        {"$unwind": {"path": "$user_doc", "preserveNullAndEmptyArrays": True}},
    ]
    salary_raw = await PayrollWithdrawalDocument.aggregate(salary_pipeline).to_list()

    salaries_list: List[SalaryItem] = []
    salaries_by_day: dict[str, float] = {}
    salaries_total = 0.0

    for r in salary_raw:
        user_name = r.get("user_doc", {}).get("name", "Unknown") if r.get("user_doc") else "Unknown"
        net = r.get("net_amount", 0.0)
        date = r.get("date", "")
        salaries_list.append(SalaryItem(
            date=date,
            user_name=user_name,
            base_salary=r.get("base_salary", 0.0),
            net_amount=net,
        ))
        salaries_by_day[date] = salaries_by_day.get(date, 0.0) + net
        salaries_total += net

    # ── Cash advances from user withdrawal_logs ─────────
    users_with_withdrawals = await UserDocument.find(
        UserDocument.withdrawal_logs.as_array().size() > 0  # type: ignore[attr-defined]
    ).to_list()

    cash_advances_list: List[CashAdvanceItem] = []
    cash_advances_by_day: dict[str, float] = {}
    cash_advances_total = 0.0

    for user in users_with_withdrawals:
        for w in (user.withdrawal_logs or []):
            if w.date >= start_date and w.date <= end_date and w.status == "Completed":
                cash_advances_list.append(CashAdvanceItem(
                    date=w.date,
                    user_name=user.name,
                    amount=w.amount,
                    status=w.status,
                ))
                cash_advances_by_day[w.date] = cash_advances_by_day.get(w.date, 0.0) + w.amount
                cash_advances_total += w.amount

    # ── Merge all dates into unified day timeline ────────
    all_dates = sorted(set(
        list(income_by_day.keys())
        + list(purchases_by_day.keys())
        + list(salaries_by_day.keys())
        + list(cash_advances_by_day.keys())
    ))

    income_by_day_list: List[FinanceDayItem] = []
    for date in all_dates:
        inc = income_by_day.get(date, 0.0)
        exp = (
            purchases_by_day.get(date, 0.0)
            + salaries_by_day.get(date, 0.0)
            + cash_advances_by_day.get(date, 0.0)
        )
        income_by_day_list.append(FinanceDayItem(
            date=date,
            income=round(inc, 2),
            expenses=round(exp, 2),
            profit=round(inc - exp, 2),
        ))

    expenses_total = purchases_total + salaries_total + cash_advances_total
    profit = income_total - expenses_total
    margin = round((profit / income_total) * 100, 1) if income_total > 0 else 0.0

    return FinanceReport(
        period_start=start_date,
        period_end=end_date,
        income_total=round(income_total, 2),
        income_order_count=income_order_count,
        income_by_day=income_by_day_list,
        income_by_payment_method=[
            PaymentMethodBreakdown(method=m, amount=round(v["amount"], 2), count=v["count"])
            for m, v in sorted(method_totals.items(), key=lambda x: -x[1]["amount"])
        ],
        expenses=ExpensesBreakdown(
            total=round(expenses_total, 2),
            purchases_total=round(purchases_total, 2),
            salaries_total=round(salaries_total, 2),
            cash_advances_total=round(cash_advances_total, 2),
            purchases=sorted(purchases_list, key=lambda x: x.date, reverse=True),
            salaries=sorted(salaries_list, key=lambda x: x.date, reverse=True),
            cash_advances=sorted(cash_advances_list, key=lambda x: x.date, reverse=True),
        ),
        profit=round(profit, 2),
        profit_margin=margin,
    )
