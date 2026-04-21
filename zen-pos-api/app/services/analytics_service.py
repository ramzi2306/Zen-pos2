from datetime import datetime, timedelta, timezone
from typing import List, Optional

from app.models.order import OrderDocument
from app.models.daily_sales import DailySalesSummary

class AnalyticsService:
    @staticmethod
    async def aggregate_daily_sales(target_date: Optional[datetime] = None):
        """
        Calculates and stores sales summary for a specific date.
        Defaults to yesterday if no date is provided.
        """
        if target_date is None:
            # Default to yesterday
            target_date = datetime.now(timezone.utc) - timedelta(days=1)
        
        start_of_day = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)
        date_str = start_of_day.strftime("%Y-%m-%d")

        # Find all paid, non-cancelled orders for that day
        orders = await OrderDocument.find(
            OrderDocument.status != "Cancelled",
            OrderDocument.payment_status == "Paid",
            OrderDocument.created_at >= start_of_day,
            OrderDocument.created_at < end_of_day
        ).to_list()

        total_revenue = 0.0
        order_count = len(orders)
        total_prep_time_ms = 0
        prep_count = 0

        for order in orders:
            total_revenue += order.total
            if order.start_time and order.end_time:
                total_prep_time_ms += (order.end_time - order.start_time)
                prep_count += 1

        # Upsert the summary
        summary = await DailySalesSummary.find_one(DailySalesSummary.date == date_str)
        if not summary:
            summary = DailySalesSummary(date=date_str)
        
        summary.total_revenue = round(total_revenue, 2)
        summary.order_count = order_count
        summary.total_prep_time_ms = total_prep_time_ms
        summary.prep_count = prep_count
        summary.created_at = datetime.now(timezone.utc)
        
        await summary.save()
        return summary

    @staticmethod
    async def get_daily_summaries(start_date: str, end_date: str) -> List[DailySalesSummary]:
        """
        Fetches pre-aggregated summaries for a date range.
        """
        return await DailySalesSummary.find(
            DailySalesSummary.date >= start_date,
            DailySalesSummary.date <= end_date
        ).sort(+DailySalesSummary.date).to_list()
