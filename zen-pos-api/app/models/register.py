from typing import Optional
from datetime import datetime, timezone
import uuid


from beanie import Document
from pydantic import Field, BaseModel
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
    # New float reconciliation fields
    opening_float: float = 0
    net_cash_collected: float = 0
    total_cash_withdrawn: float = 0
    counted_closing_float: float = 0
    discrepancy: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "register_reports"
        indexes = [
            IndexModel([("closed_at", DESCENDING)]),
            IndexModel([("location_id", DESCENDING)]),
        ]

class WithdrawalRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    notes: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # category: other | salary_advance | purchase
    category: str = "other"
    reference_id: Optional[str] = None    # payroll withdrawal ID or purchase log ID
    reference_label: Optional[str] = None  # "Alice - salary advance" or "Tomatoes 5kg"

class RegisterSessionDocument(Document):
    """Active or historically tracked register sessions."""
    cashier_id: str
    cashier_name: str
    location_id: Optional[str] = None
    status: str = "OPEN" # OPEN, CLOSED
    opened_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None
    opening_float: float = 0
    net_cash_collected: float = 0
    total_cash_withdrawn: float = 0
    withdrawals: list[WithdrawalRecord] = []
    counted_closing_float: Optional[float] = None
    discrepancy: Optional[float] = None
    float_status: str = "OK"  # OK, WARNING, ALERT
    closing_notes: Optional[str] = None
    
    last_activity_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_stale: bool = False
    resumed_at: Optional[datetime] = None
    resume_count: int = 0

    class Settings:
        name = "register_sessions"
        indexes = [
            IndexModel([("cashier_id", DESCENDING)]),
            IndexModel([("status", DESCENDING)]),
        ]

