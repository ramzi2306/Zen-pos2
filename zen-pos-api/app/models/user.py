from typing import Annotated, Optional
from datetime import date

from beanie import Document, Indexed, Link
from pydantic import BaseModel, EmailStr, Field
from pymongo import IndexModel, ASCENDING


# ── Embedded sub-documents ─────────────────────────────────

class AttendanceDay(BaseModel):
    day: str
    hours: float = 0
    is_late: bool = False
    is_early_departure: bool = False
    is_overtime: bool = False
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    reward_note: Optional[str] = None
    sanction_note: Optional[str] = None


class WithdrawalLog(BaseModel):
    id: str
    amount: float
    date: str
    status: str = "Completed"  # Completed | Pending


class PersonalDocument(BaseModel):
    id: str
    name: str
    type: str
    url: str


# ── Role document ──────────────────────────────────────────

class RoleDocument(Document):
    name: Annotated[str, Indexed(unique=True)]
    permissions: list[str] = []
    exclude_from_attendance: bool = False

    class Settings:
        name = "roles"
        indexes = [IndexModel([("name", ASCENDING)], unique=True)]


# ── User document ──────────────────────────────────────────

class UserDocument(Document):
    name: str
    email: Annotated[EmailStr, Indexed(unique=True)]
    hashed_password: str
    hashed_pin: Optional[str] = None          # 4-digit kiosk PIN (bcrypt)
    attendance_group: str = ""                # "kitchen" | "cashier" | "admin" | "" (all)
    phone: Optional[str] = ""
    role: Optional[Link[RoleDocument]] = None
    image: Optional[str] = ""
    base_salary: Optional[float] = 0
    payroll_due: Optional[str] = ""
    attendance_score: Optional[float] = 0
    shifts: Optional[dict[str, str]] = Field(default_factory=dict)
    monthly_attendance: Optional[list[AttendanceDay]] = Field(default_factory=list)
    rewards: Optional[int] = 0
    sanctions: Optional[int] = 0
    start_date: Optional[str] = ""
    contract_type: Optional[str] = ""
    contract_date: Optional[str] = ""
    contract_expiration: Optional[str] = None
    withdrawal_logs: Optional[list[WithdrawalLog]] = Field(default_factory=list)
    personal_documents: Optional[list[PersonalDocument]] = Field(default_factory=list)
    location_id: Optional[str] = None        # ID of the assigned LocationDocument
    is_active: Optional[bool] = True

    class Settings:
        name = "users"
        indexes = [IndexModel([("email", ASCENDING)], unique=True)]
