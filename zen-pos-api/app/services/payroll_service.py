from datetime import datetime, timezone

from app.core.exceptions import NotFoundError
from app.models.payroll import PayrollWithdrawalDocument, PerformanceLogDocument
from app.models.user import UserDocument
from app.schemas.payroll import PayrollSummary, WithdrawalRequest

WORKING_DAYS_PER_MONTH = 22
SHIFT_HOURS = 8  # standard shift length


async def get_payroll_summary(user_id: str) -> PayrollSummary:
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")

    base = float(user.base_salary or 0)
    # Hourly rate derived purely from salary and shift structure
    hourly_rate = base / (WORKING_DAYS_PER_MONTH * SHIFT_HOURS)

    # Only days where the employee checked in count as worked
    worked = [d for d in (user.monthly_attendance or []) if d.check_in]
    worked_days = len(worked)

    # Pro-rated base
    earned_base = round(base * (worked_days / WORKING_DAYS_PER_MONTH), 2)

    # Per-day breakdown — each day contributes either a shortfall or extra hours, never both
    late_deduction = 0.0
    early_deduction = 0.0
    overtime_bonus = 0.0
    early_arrival_bonus = 0.0
    late_count = 0
    early_count = 0
    early_arrival_count = 0
    total_overtime_hours = 0.0

    for d in worked:
        hours = d.hours or 0.0
        shortfall = max(0.0, SHIFT_HOURS - hours)   # time NOT worked vs full shift
        extra = max(0.0, hours - SHIFT_HOURS)        # time worked BEYOND full shift

        # Shortfall → deduction (one shortfall per day, assigned to one cause)
        if shortfall > 0:
            if d.is_late:
                late_count += 1
                late_deduction += shortfall * hourly_rate
            elif d.is_early_departure:
                early_count += 1
                early_deduction += shortfall * hourly_rate
            # If both flags somehow set, is_late takes priority above

        # Extra hours → bonus (one extra block per day, assigned to one cause)
        if extra > 0:
            if d.is_overtime:
                total_overtime_hours += extra
                overtime_bonus += extra * hourly_rate
            elif d.is_early_arrival:
                early_arrival_count += 1
                early_arrival_bonus += extra * hourly_rate

    late_deduction = round(late_deduction, 2)
    early_deduction = round(early_deduction, 2)
    overtime_bonus = round(overtime_bonus, 2)
    early_arrival_bonus = round(early_arrival_bonus, 2)

    # Performance log adjustments (fixed amounts set by HR)
    logs = await PerformanceLogDocument.find(
        PerformanceLogDocument.user.id == user.id  # type: ignore[attr-defined]
    ).to_list()
    reward_bonus = round(sum(_parse_impact(l.impact) for l in logs if l.type == "Reward"), 2)
    sanction_deduction = round(sum(_parse_impact(l.impact) for l in logs if l.type == "Sanction"), 2)

    net = round(
        earned_base
        + reward_bonus
        + overtime_bonus
        + early_arrival_bonus
        - sanction_deduction
        - late_deduction
        - early_deduction,
        2,
    )

    summary = PayrollSummary(
        user_id=user_id,
        user_name=user.name,
        base_salary=base,
        reward_bonus=reward_bonus,
        sanction_deduction=sanction_deduction,
        overtime_bonus=overtime_bonus,
        early_arrival_bonus=early_arrival_bonus,
        late_deduction=late_deduction,
        early_departure_deduction=early_deduction,
        net_payable=net,
        late_count=late_count,
        early_departure_count=early_count,
        early_arrival_count=early_arrival_count,
        overtime_hours=round(total_overtime_hours, 2),
    )

    user.payroll_due = str(net)
    await user.save()

    return summary


async def process_withdrawal(data: WithdrawalRequest) -> PayrollWithdrawalDocument:
    summary = await get_payroll_summary(data.user_id)
    user = await UserDocument.get(data.user_id)

    withdrawal = PayrollWithdrawalDocument(
        user=user,
        amount=data.amount,
        net_amount=summary.net_payable,
        base_salary=summary.base_salary,
        reward_bonus=summary.reward_bonus,
        sanction_deduction=summary.sanction_deduction,
        overtime_bonus=summary.overtime_bonus,
        late_deduction=summary.late_deduction,
        early_departure_deduction=summary.early_departure_deduction,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        admin_notes=data.admin_notes,
        audit_notes=data.audit_notes,
    )
    await withdrawal.insert()
    return withdrawal


def _parse_impact(impact: str) -> float:
    try:
        return float(str(impact).replace("$", "").replace("+", ""))
    except ValueError:
        return 0.0
