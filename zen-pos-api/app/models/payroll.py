from typing import Optional

from beanie import Document, Link
from pymongo import IndexModel, ASCENDING, DESCENDING

from app.models.user import UserDocument


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
