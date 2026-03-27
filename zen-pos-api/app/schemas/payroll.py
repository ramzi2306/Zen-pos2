from typing import Optional
from pydantic import BaseModel


class PayrollSummary(BaseModel):
    user_id: str
    user_name: str
    base_salary: float
    reward_bonus: float
    sanction_deduction: float
    overtime_bonus: float
    late_deduction: float
    early_departure_deduction: float
    net_payable: float
    late_count: int
    early_departure_count: int
    overtime_hours: float


class WithdrawalRequest(BaseModel):
    user_id: str
    amount: float
    admin_notes: str = ""
    audit_notes: str = ""


class WithdrawalOut(BaseModel):
    id: str
    user_id: str
    amount: float
    net_amount: float
    date: str
    status: str


class PerformanceLogCreate(BaseModel):
    user_id: str
    type: str                                  # Reward | Sanction
    title: str
    impact: str


class PerformanceLogOut(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    impact: str
    date: str
