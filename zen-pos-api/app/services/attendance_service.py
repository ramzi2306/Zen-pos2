from datetime import datetime, timezone
from typing import Optional

from app.core.exceptions import NotFoundError, BadRequestError, UnauthorizedError
from app.core.security import verify_password
from app.models.attendance import AttendanceRecordDocument
from app.models.user import UserDocument

# Grace period before a check-in is considered "late" (minutes)
LATE_GRACE_MINUTES = 5
# Threshold before a check-out is considered "early departure" (minutes)
EARLY_GRACE_MINUTES = 5
# Minutes past expected check-out that counts as overtime
OVERTIME_THRESHOLD_MINUTES = 30


def _parse_shift(shift_str: str) -> tuple:
    """Parse 'HH:MM-HH:MM' into (expected_check_in, expected_check_out).
    Returns (None, None) if the string is missing or not in that format."""
    if not shift_str or "-" not in shift_str:
        return None, None
    parts = shift_str.split("-", 1)
    ci = parts[0].strip() or None
    co = parts[1].strip() or None
    return ci, co


def _minutes_diff(actual_hhmm: str, expected_hhmm: str) -> float:
    """Return (actual - expected) in minutes. Positive = actual is later."""
    try:
        base = datetime(2000, 1, 1)
        ah, am = map(int, actual_hhmm.split(":"))
        eh, em = map(int, expected_hhmm.split(":"))
        return (ah * 60 + am) - (eh * 60 + em)
    except Exception:
        return 0.0


async def check_in(user_id: str, pin: str) -> AttendanceRecordDocument:
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")

    if not user.hashed_pin or not verify_password(pin, user.hashed_pin):
        raise UnauthorizedError("Invalid PIN")

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    weekday = now.strftime("%a")  # 'Mon', 'Tue', …

    # Prevent duplicate check-in on same day
    existing = await AttendanceRecordDocument.find_one(
        AttendanceRecordDocument.user.id == user.id,  # type: ignore[attr-defined]
        AttendanceRecordDocument.date == today,
    )
    if existing and existing.status == "active":
        raise BadRequestError("Already checked in today")

    # Determine is_late from shift schedule
    is_late = False
    expected_ci, _ = _parse_shift(user.shifts.get(weekday, ""))
    if expected_ci:
        actual_hhmm = now.strftime("%H:%M")
        diff = _minutes_diff(actual_hhmm, expected_ci)
        is_late = diff > LATE_GRACE_MINUTES

    record = AttendanceRecordDocument(
        user=user,
        date=today,
        check_in=now.isoformat(),
        status="active",
        is_late=is_late,
        location_id=user.location_id,   # inherit user's location at time of check-in
    )
    await record.insert()
    return record


async def check_out(user_id: str, pin: str) -> AttendanceRecordDocument:
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")

    if not user.hashed_pin or not verify_password(pin, user.hashed_pin):
        raise UnauthorizedError("Invalid PIN")

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    weekday = now.strftime("%a")

    record = await AttendanceRecordDocument.find_one(
        AttendanceRecordDocument.user.id == user.id,  # type: ignore[attr-defined]
        AttendanceRecordDocument.date == today,
        AttendanceRecordDocument.status == "active",
    )
    if not record:
        raise BadRequestError("No active check-in found for today")

    record.check_out = now.isoformat()
    record.status = "completed"

    if record.check_in:
        check_in_dt = datetime.fromisoformat(record.check_in)
        delta = now - check_in_dt
        record.hours = round(delta.total_seconds() / 3600, 2)

    # Determine early departure / overtime from shift schedule
    _, expected_co = _parse_shift(user.shifts.get(weekday, ""))
    if expected_co:
        actual_hhmm = now.strftime("%H:%M")
        diff = _minutes_diff(actual_hhmm, expected_co)  # positive = checked out later
        record.is_early_departure = diff < -EARLY_GRACE_MINUTES
        record.is_overtime = diff > OVERTIME_THRESHOLD_MINUTES

    await record.save()
    return record


async def get_today_records(location_id: Optional[str] = None) -> list[AttendanceRecordDocument]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = AttendanceRecordDocument.find(AttendanceRecordDocument.date == today)
    if location_id:
        query = query.find(AttendanceRecordDocument.location_id == location_id)
    return await query.to_list()


async def get_user_records(user_id: str) -> list[AttendanceRecordDocument]:
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    return await AttendanceRecordDocument.find(
        AttendanceRecordDocument.user.id == user.id  # type: ignore[attr-defined]
    ).sort("-date").to_list()
