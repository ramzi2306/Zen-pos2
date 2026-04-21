from typing import List, Optional
from fastapi import APIRouter, Depends

from app.dependencies import require_permission
from app.models.payroll import PayrollWithdrawalDocument, PerformanceLogDocument
from app.models.user import UserDocument
from app.schemas.payroll import (
    PayrollSummary, WithdrawalRequest, WithdrawalOut,
    PerformanceLogCreate, PerformanceLogOut,
)
from app.services import payroll_service
from app.core.exceptions import NotFoundError
from datetime import datetime, timezone

router = APIRouter()


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
