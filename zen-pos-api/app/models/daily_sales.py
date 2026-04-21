from datetime import datetime, timezone
from beanie import Document
from pydantic import Field

class DailySalesSummary(Document):
    date: str  # ISO date YYYY-MM-DD
    total_revenue: float = 0.0
    order_count: int = 0
    total_prep_time_ms: int = 0
    prep_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "daily_sales_summaries"
        indexes = [
            "date",
        ]
