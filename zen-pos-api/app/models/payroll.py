from typing import Optional

from beanie import Document, Link
from pymongo import IndexModel, ASCENDING, DESCENDING

from app.models.user import UserDocument


class PayrollSnapshotDocument(Document):
    """Cached payroll summary per user, keyed by month (YYYY-MM). Updated every time
    get_payroll_summary() runs so HR panel can read stale-free numbers without recomputing."""
    user: Link[UserDocument]
    month: str                                  # YYYY-MM
    base_salary: float
    earned_base: float
    reward_bonus: float = 0
    sanction_deduction: float = 0
    overtime_bonus: float = 0
    early_arrival_bonus: float = 0
    late_deduction: float = 0
    early_departure_deduction: float = 0
    net_payable: float
    worked_days: int = 0
    late_count: int = 0
    early_departure_count: int = 0
    early_arrival_count: int = 0
    overtime_hours: float = 0

    class Settings:
        name = "payroll_snapshots"
        indexes = [
            IndexModel([("user.$id", ASCENDING), ("month", DESCENDING)]),
        ]


class PayrollWithdrawalDocument(Document):
    user: Link[UserDocument]
    amount: float
    net_amount: float                          # after deductions
    base_salary: float
    reward_bonus: float = 0
    sanction_deduction: float = 0
    overtime_bonus: float = 0
    late_deduction: float = 0
    early_departure_deduction: float = 0
    date: str                                  # ISO date
    status: str = "Completed"                 # Completed | Pending
    admin_notes: str = ""
    audit_notes: str = ""

    class Settings:
        name = "payroll_withdrawals"
        indexes = [
            IndexModel([("user.$id", ASCENDING), ("date", DESCENDING)]),
        ]


class PerformanceLogDocument(Document):
    user: Link[UserDocument]
    type: str                                  # Reward | Sanction
    title: str
    impact: str                                # human-readable, e.g. "+$50"
    date: str                                  # ISO date
    created_by: Optional[Link[UserDocument]] = None

    class Settings:
        name = "performance_logs"
        indexes = [
            IndexModel([("user.$id", ASCENDING), ("date", DESCENDING)]),
            IndexModel([("type", ASCENDING)]),
        ]
