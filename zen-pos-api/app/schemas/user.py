from typing import Optional
from pydantic import BaseModel, EmailStr


class RoleOut(BaseModel):
    id: str
    name: str
    permissions: list[str]


class UserPublic(BaseModel):
    """Safe user representation — no password/pin fields."""
    id: str
    name: str
    email: str
    phone: str
    role_id: str
    role_name: str
    permissions: list[str]
    image: str
    base_salary: float
    attendance_score: float
    attendance_group: str
    has_pin: bool
    is_active: bool
    exclude_from_attendance: bool = False
    is_system: bool = False
    in_order_prep: bool = True
    location_id: Optional[str] = None
    location_name: Optional[str] = None
    shifts: dict[str, str] = {}
    start_date: str = ""
    contract_type: str = ""
    contract_date: str = ""
    contract_expiration: Optional[str] = None


class AttendanceDayOut(BaseModel):
    day: str
    hours: float
    is_late: bool
    is_early_departure: bool
    is_overtime: bool
    check_in: Optional[str]
    check_out: Optional[str]
    reward_note: Optional[str]
    sanction_note: Optional[str]


class WithdrawalLogOut(BaseModel):
    id: str
    amount: float
    date: str
    status: str


class PersonalDocumentOut(BaseModel):
    id: str
    name: str
    type: str
    url: str


class UserDetail(UserPublic):
    """Full user info for admin views — includes HR data."""
    payroll_due: str
    rewards: int
    sanctions: int
    monthly_attendance: list[AttendanceDayOut]
    withdrawal_logs: list[WithdrawalLogOut]
    personal_documents: list[PersonalDocumentOut]


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    pin: Optional[str] = None                 # 4-digit kiosk PIN
    phone: str = ""
    role_id: str
    location_id: Optional[str] = None
    image: str = ""
    base_salary: float = 0
    contract_type: str = ""
    start_date: str = ""


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role_id: Optional[str] = None
    image: Optional[str] = None
    base_salary: Optional[float] = None
    start_date: Optional[str] = None
    contract_type: Optional[str] = None
    contract_date: Optional[str] = None
    contract_expiration: Optional[str] = None
    shifts: Optional[dict[str, str]] = None
    attendance_group: Optional[str] = None
    location_id: Optional[str] = None
    is_active: Optional[bool] = None
    personal_documents: Optional[list[PersonalDocumentOut]] = None


class UpdatePinRequest(BaseModel):
    pin: str                                  # plain 4-digit PIN — hashed server-side


class ChangeRoleRequest(BaseModel):
    role_id: str


class VerifyPinRequest(BaseModel):
    pin: str


class AdminResetPasswordRequest(BaseModel):
    new_password: str                         # plain password — hashed server-side
