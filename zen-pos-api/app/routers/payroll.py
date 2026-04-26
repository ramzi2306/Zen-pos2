from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import require_permission
from app.models.payroll import PayrollWithdrawalDocument, PerformanceLogDocument, PayrollSnapshotDocument
from app.models.user import UserDocument
from app.schemas.payroll import (
    PayrollSummary, WithdrawalRequest, WithdrawalOut,
    PerformanceLogCreate, PerformanceLogOut,
)
from app.services import payroll_service
from app.core.exceptions import NotFoundError
from datetime import datetime, timezone

router = APIRouter()


class SnapshotOut(BaseModel):
    user_id: str
    user_name: str
    month: str
    base_salary: float
    earned_base: float
    reward_bonus: float
    sanction_deduction: float
    overtime_bonus: float
    early_arrival_bonus: float
    late_deduction: float
    early_departure_deduction: float
    net_payable: float
    worked_days: int
    late_count: int
    early_departure_count: int
    early_arrival_count: int
    overtime_hours: float


def _snap_to_out(s: PayrollSnapshotDocument, user: UserDocument) -> SnapshotOut:
    return SnapshotOut(
        user_id=str(user.id),
        user_name=user.name,
        month=s.month,
        base_salary=s.base_salary,
        earned_base=s.earned_base,
        reward_bonus=s.reward_bonus,
        sanction_deduction=s.sanction_deduction,
        overtime_bonus=s.overtime_bonus,
        early_arrival_bonus=s.early_arrival_bonus,
        late_deduction=s.late_deduction,
        early_departure_deduction=s.early_departure_deduction,
        net_payable=s.net_payable,
        worked_days=s.worked_days,
        late_count=s.late_count,
        early_departure_count=s.early_departure_count,
        early_arrival_count=s.early_arrival_count,
        overtime_hours=s.overtime_hours,
    )


@router.get("/snapshots", response_model=list[SnapshotOut],
            dependencies=[Depends(require_permission("view_hr"))])
async def list_snapshots(month: Optional[str] = None):
    """Return the latest payroll snapshot for every user (current month by default)."""
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    snaps = await PayrollSnapshotDocument.find(
        PayrollSnapshotDocument.month == target_month,
    ).to_list()
    result = []
    for s in snaps:
        await s.fetch_link(PayrollSnapshotDocument.user)
        user = s.user  # type: ignore[assignment]
        if hasattr(user, "name"):
            result.append(_snap_to_out(s, user))  # type: ignore[arg-type]
    return result


@router.get("/snapshots/{user_id}", response_model=SnapshotOut,
            dependencies=[Depends(require_permission("view_hr"))])
async def get_snapshot(user_id: str, month: Optional[str] = None):
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    snap = await PayrollSnapshotDocument.find_one(
        PayrollSnapshotDocument.user.id == user.id,  # type: ignore[attr-defined]
        PayrollSnapshotDocument.month == target_month,
    )
    if not snap:
        # Compute on-demand and cache it
        await payroll_service.get_payroll_summary(user_id)
        snap = await PayrollSnapshotDocument.find_one(
            PayrollSnapshotDocument.user.id == user.id,  # type: ignore[attr-defined]
            PayrollSnapshotDocument.month == target_month,
        )
        if not snap:
            raise NotFoundError("Snapshot not available")
    return _snap_to_out(snap, user)


@router.post("/snapshots/refresh-all", status_code=200,
             dependencies=[Depends(require_permission("view_hr"))])
async def refresh_all_snapshots():
    """Batch-compute and cache payroll snapshots for all non-system users."""
    count = await payroll_service.refresh_all_snapshots()
    return {"refreshed": count}


@router.get("/summary/{user_id}", response_model=PayrollSummary,
            dependencies=[Depends(require_permission("view_hr"))])
async def payroll_summary(user_id: str):
    return await payroll_service.get_payroll_summary(user_id)


@router.post("/withdraw", response_model=WithdrawalOut,
             dependencies=[Depends(require_permission("view_hr"))])
async def withdraw(body: WithdrawalRequest):
    w = await payroll_service.process_withdrawal(body)
    return WithdrawalOut(
        id=str(w.id),
        user_id=str(w.user.ref.id) if hasattr(w.user, "ref") else "",
        amount=w.amount,
        net_amount=w.net_amount,
        date=w.date,
        status=w.status,
    )


@router.get("/withdrawals/{user_id}", response_model=list[WithdrawalOut],
            dependencies=[Depends(require_permission("view_hr"))])
async def user_withdrawals(user_id: str):
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    records = await PayrollWithdrawalDocument.find(
        PayrollWithdrawalDocument.user.id == user.id  # type: ignore[attr-defined]
    ).sort("-date").to_list()
    return [
        WithdrawalOut(
            id=str(w.id),
            user_id=user_id,
            amount=w.amount,
            net_amount=w.net_amount,
            date=w.date,
            status=w.status,
        )
        for w in records
    ]


class WithdrawalEditRequest(BaseModel):
    amount: float
    admin_notes: Optional[str] = None
    audit_notes: Optional[str] = None
    status: Optional[str] = None


@router.patch("/withdrawals/{withdrawal_id}", response_model=WithdrawalOut,
              dependencies=[Depends(require_permission("view_hr"))])
async def edit_salary_withdrawal(withdrawal_id: str, body: WithdrawalEditRequest):
    record = await PayrollWithdrawalDocument.get(withdrawal_id)
    if not record:
        raise NotFoundError("Withdrawal record not found")
    record.amount = body.amount
    if body.admin_notes is not None:
        record.admin_notes = body.admin_notes
    if body.audit_notes is not None:
        record.audit_notes = body.audit_notes
    if body.status is not None:
        record.status = body.status
    await record.save()
    return WithdrawalOut(
        id=str(record.id),
        user_id=str(record.user.ref.id) if hasattr(record.user, "ref") else "",
        amount=record.amount,
        net_amount=record.net_amount,
        date=record.date,
        status=record.status,
    )


@router.delete("/withdrawals/{withdrawal_id}", status_code=204,
               dependencies=[Depends(require_permission("view_hr"))])
async def delete_salary_withdrawal(withdrawal_id: str):
    record = await PayrollWithdrawalDocument.get(withdrawal_id)
    if not record:
        raise NotFoundError("Withdrawal record not found")
    await record.delete()


@router.get("/performance-logs", response_model=list[PerformanceLogOut],
            dependencies=[Depends(require_permission("view_hr"))])
async def list_performance_logs(user_id: Optional[str] = None):
    query = PerformanceLogDocument.find()
    if user_id:
        user = await UserDocument.get(user_id)
        if user:
            query = query.find(PerformanceLogDocument.user.id == user.id)  # type: ignore[attr-defined]
    logs = await query.sort("-date").to_list()
    return [_log_to_out(l, user_id or "") for l in logs]


@router.post("/performance-logs", response_model=PerformanceLogOut, status_code=201,
             dependencies=[Depends(require_permission("view_hr"))])
async def create_performance_log(body: PerformanceLogCreate):
    user = await UserDocument.get(body.user_id)
    if not user:
        raise NotFoundError("User not found")
    log = PerformanceLogDocument(
        user=user,
        type=body.type,
        title=body.title,
        impact=body.impact,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    await log.insert()

    impact_val = 0.0
    try:
        impact_val = float(body.impact.replace("$", "").replace("+", ""))
    except ValueError:
        pass

    if body.type == "Reward":
        user.rewards += int(impact_val)
    elif body.type == "Sanction":
        user.sanctions += int(impact_val)
    await user.save()

    return _log_to_out(log, body.user_id)


@router.delete("/performance-logs/{log_id}", status_code=204,
               dependencies=[Depends(require_permission("view_hr"))])
async def delete_performance_log(log_id: str):
    log = await PerformanceLogDocument.get(log_id)
    if not log:
        raise NotFoundError("Performance log not found")

    # Reverse the impact on the user's aggregate totals
    impact_val = 0.0
    try:
        impact_val = float(str(log.impact).replace("$", "").replace("+", ""))
    except ValueError:
        pass

    if impact_val > 0:
        user = await UserDocument.get(log.user.ref.id if hasattr(log.user, "ref") else str(log.user.id))
        if user:
            if log.type == "Reward":
                user.rewards = max(0, user.rewards - int(impact_val))
            elif log.type == "Sanction":
                user.sanctions = max(0, user.sanctions - int(impact_val))
            await user.save()

    await log.delete()


def _log_to_out(l: PerformanceLogDocument, user_id: str) -> PerformanceLogOut:
    uid = str(l.user.ref.id) if hasattr(l.user, "ref") else user_id
    return PerformanceLogOut(
        id=str(l.id),
        user_id=uid,
        type=l.type,
        title=l.title,
        impact=l.impact,
        date=l.date,
    )
