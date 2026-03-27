from typing import Optional
from pydantic import BaseModel


class CheckInRequest(BaseModel):
    user_id: str
    pin: str                                  # 4-digit PIN


class CheckOutRequest(BaseModel):
    user_id: str
    pin: str


class AttendanceRecordOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    date: str
    check_in: Optional[str]
    check_out: Optional[str]
    status: str
    hours: float
    is_late: bool
    is_early_departure: bool
    is_overtime: bool


class AttendanceReportEntry(BaseModel):
    """Per-record row for the HR attendance report."""
    id: str
    user_id: str
    user_name: str
    user_image: str
    date: str
    check_in: Optional[str]
    check_out: Optional[str]
    status: str
    hours: float
    is_late: bool
    is_early_departure: bool
    is_overtime: bool


class AttendanceReportSummary(BaseModel):
    """Per-user aggregate for the HR attendance report."""
    user_id: str
    user_name: str
    user_image: str
    total_days: int
    total_hours: float
    late_count: int
    early_departure_count: int
    overtime_count: int
    records: list[AttendanceReportEntry]


class AttendanceReportOut(BaseModel):
    start_date: str
    end_date: str
    summaries: list[AttendanceReportSummary]
