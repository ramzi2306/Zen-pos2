from typing import Optional
from datetime import datetime, timezone

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, DESCENDING


class RegisterReportDocument(Document):
    """Persisted record of each register closure session."""
    opened_at: int                          # epoch ms — when the session started
    closed_at: int                          # epoch ms — when the cashier closed the register
    cashier_name: str
    expected_sales: float                   # system-calculated total from POS orders
    actual_sales: float                     # physically counted amount
    difference: float                       # actual - expected
    notes: Optional[str] = None
    location_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "register_reports"
        indexes = [
            IndexModel([("closed_at", DESCENDING)]),
            IndexModel([("location_id", DESCENDING)]),
        ]
