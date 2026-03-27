from typing import Optional
from datetime import date

from beanie import Document, Link
from pymongo import IndexModel, ASCENDING

from app.models.user import UserDocument


class AttendanceRecordDocument(Document):
    user: Link[UserDocument]
    date: str                                 # ISO date string, e.g. "2024-03-12"
    check_in: Optional[str] = None            # ISO datetime string
    check_out: Optional[str] = None
    status: str = "active"                    # active | completed
    hours: float = 0
    is_late: bool = False
    is_early_departure: bool = False
    is_overtime: bool = False
    notes: str = ""
    location_id: Optional[str] = None        # auto-set from user's location at check-in

    class Settings:
        name = "attendance_records"
        indexes = [
            IndexModel([("user.$id", ASCENDING), ("date", ASCENDING)]),
            IndexModel([("date", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("location_id", ASCENDING)]),
        ]
