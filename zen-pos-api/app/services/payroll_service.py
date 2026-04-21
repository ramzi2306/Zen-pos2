from datetime import datetime, timezone

from app.core.exceptions import NotFoundError
from app.models.payroll import PayrollWithdrawalDocument, PerformanceLogDocument
from app.models.user import UserDocument
from app.schemas.payroll import PayrollSummary, WithdrawalRequest

# Deduction / bonus rates (per incident)
LATE_FEE_PER_INCIDENT = 20.0          # $20 per late arrival
EARLY_DEPARTURE_FEE = 25.0            # $25 per early departure (increased)
EARLY_ARRIVAL_BONUS = 15.0            # $15 per early arrival
OVERTIME_BONUS_PER_HOUR = 30.0        # $30 per overtime hour


async def get_payroll_summary(user_id: str) -> PayrollSummary:
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")

    late_count = sum(1 for d in user.monthly_attendance if d.is_late)
    early_count = sum(1 for d in user.monthly_attendance if d.is_early_departure)
    early_arrival_count = sum(1 for d in user.monthly_attendance if d.is_early_arrival)
    overtime_hours = sum(
        d.hours - 8 for d in user.monthly_attendance if d.is_overtime and d.hours > 8
    )

    late_deduction = late_count * LATE_FEE_PER_INCIDENT
    early_deduction = early_count * EARLY_DEPARTURE_FEE
    early_arrival_bonus = early_arrival_count * EARLY_ARRIVAL_BONUS
    overtime_bonus = round(overtime_hours * OVERTIME_BONUS_PER_HOUR, 2)

    # Performance adjustments from logs
    logs = await PerformanceLogDocument.find(
        PerformanceLogDocument.user.id == user.id  # type: ignore[attr-defined]
    ).to_list()
    reward_bonus = sum(_parse_impact(l.impact) for l in logs if l.type == "Reward")
    sanction_deduction = sum(_parse_impact(l.impact) for l in logs if l.type == "Sanction")

    net = (
        user.base_salary
        + reward_bonus
        + overtime_bonus
        + early_arrival_bonus
        - sanction_deduction
        - late_deduction
        - early_deduction
    )

    return PayrollSummary(
        user_id=user_id,
        user_name=user.name,
        base_salary=user.base_salary,
        reward_bonus=reward_bonus,
        sanction_deduction=sanction_deduction,
        overtime_bonus=overtime_bonus,
        early_arrival_bonus=early_arrival_bonus,
        late_deduction=late_deduction,
        early_departure_deduction=early_deduction,
        net_payable=round(net, 2),
        late_count=late_count,
        early_departure_count=early_count,
        early_arrival_count=early_arrival_count,
        overtime_hours=round(overtime_hours, 2),
    )


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
    """Extract numeric value from impact string like '+$50' or '-$30'."""
    try:
        return float(impact.replace("$", "").replace("+", ""))
    except ValueError:
        return 0.0
