from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import require_permission
from app.models.attendance import AttendanceRecordDocument
from app.models.user import UserDocument
from app.schemas.attendance import (
    CheckInRequest, CheckOutRequest, AttendanceRecordOut,
    AttendanceReportOut, AttendanceReportSummary, AttendanceReportEntry,
)
from app.services import attendance_service
from app.core.exceptions import NotFoundError

router = APIRouter()


@router.post("/check-in", response_model=AttendanceRecordOut)
async def check_in(body: CheckInRequest):
    """PIN-verified check-in. No auth token required (kiosk endpoint)."""
    record = await attendance_service.check_in(body.user_id, body.pin)
    return await _to_out(record)


@router.post("/check-out", response_model=AttendanceRecordOut)
async def check_out(body: CheckOutRequest):
    """PIN-verified check-out."""
    record = await attendance_service.check_out(body.user_id, body.pin)
    return await _to_out(record)


@router.get("/today", response_model=list[AttendanceRecordOut])
async def today_records(
    location_id: Optional[str] = Query(None, description="Override location filter"),
    current_user: UserDocument = Depends(require_permission("view_attendance")),
):
    effective_location = current_user.location_id or location_id
    records = await attendance_service.get_today_records(location_id=effective_location)
    return [await _to_out(r) for r in records]


@router.get("/status/{user_id}")
async def user_status(user_id: str):
    """Check if a user is currently checked in today (no auth — kiosk endpoint)."""
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    record = await AttendanceRecordDocument.find_one(
        AttendanceRecordDocument.user.id == user.id,  # type: ignore[attr-defined]
        AttendanceRecordDocument.date == today,
        AttendanceRecordDocument.status == "active",
    )
    return {"checked_in": record is not None}


@router.get("/user/{user_id}", response_model=list[AttendanceRecordOut],
            dependencies=[Depends(require_permission("view_attendance"))])
async def user_records(user_id: str):
    records = await attendance_service.get_user_records(user_id)
    return [await _to_out(r) for r in records]


@router.get("/report", response_model=AttendanceReportOut,
            dependencies=[Depends(require_permission("view_hr"))])
async def attendance_report(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user_id: Optional[str] = Query(None, description="Filter to a single user"),
):
    """HR attendance report: aggregate per-user records for a date range."""
    query = AttendanceRecordDocument.find(
        AttendanceRecordDocument.date >= start_date,
        AttendanceRecordDocument.date <= end_date,
    )
    if user_id:
        user = await UserDocument.get(user_id)
        if not user:
            raise NotFoundError("User not found")
        query = query.find(AttendanceRecordDocument.user.id == user.id)  # type: ignore[attr-defined]

    records = await query.to_list()

    # Group by user
    by_user: dict[str, list[AttendanceRecordDocument]] = {}
    for r in records:
        await r.fetch_all_links()
        uid = str(r.user.id) if r.user else ""
        by_user.setdefault(uid, []).append(r)

    summaries: list[AttendanceReportSummary] = []
    for uid, recs in by_user.items():
        u = recs[0].user
        entries = [
            AttendanceReportEntry(
                id=str(r.id),
                user_id=uid,
                user_name=u.name if u else "",
                user_image=u.image if u else "",
                date=r.date,
                check_in=r.check_in,
                check_out=r.check_out,
                status=r.status,
                hours=r.hours,
                is_late=r.is_late,
                is_early_departure=r.is_early_departure,
                is_overtime=r.is_overtime,
            )
            for r in recs
        ]
        summaries.append(AttendanceReportSummary(
            user_id=uid,
            user_name=u.name if u else "",
            user_image=u.image if u else "",
            total_days=len(recs),
            total_hours=sum(r.hours for r in recs),
            late_count=sum(1 for r in recs if r.is_late),
            early_departure_count=sum(1 for r in recs if r.is_early_departure),
            overtime_count=sum(1 for r in recs if r.is_overtime),
            records=entries,
        ))

    return AttendanceReportOut(start_date=start_date, end_date=end_date, summaries=summaries)


async def _to_out(r: AttendanceRecordDocument) -> AttendanceRecordOut:
    await r.fetch_all_links()
    user = r.user
    return AttendanceRecordOut(
        id=str(r.id),
        user_id=str(user.id) if user else "",
        user_name=user.name if user else "",
        date=r.date,
        check_in=r.check_in,
        check_out=r.check_out,
        status=r.status,
        hours=r.hours,
        is_late=r.is_late,
        is_early_departure=r.is_early_departure,
        is_overtime=r.is_overtime,
    )
