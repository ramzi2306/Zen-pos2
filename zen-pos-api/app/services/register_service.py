from typing import Optional
from app.models.register import RegisterSessionDocument

async def record_cash_collection(cashier_id: str, amount: float):
    """Increment net_cash_collected for the active session of the given cashier."""
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if session:
        session.net_cash_collected += amount
        await session.save()

async def record_cash_withdrawal(cashier_id: str, amount: float, notes: Optional[str] = None):
    """Increment total_cash_withdrawn and record the withdrawal entry for the active session."""
    from app.models.register import WithdrawalRecord
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if session:
        session.total_cash_withdrawn += amount
        if session.withdrawals is None: session.withdrawals = []
        session.withdrawals.append(WithdrawalRecord(amount=amount, notes=notes))
        await session.save()

async def delete_cash_withdrawal(cashier_id: str, withdrawal_id: str):
    """Remove a withdrawal record and decrement the total withdrawn amount."""
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if session and session.withdrawals:
        # Find the withdrawal
        record = next((w for w in session.withdrawals if w.id == withdrawal_id), None)
        if record:
            session.total_cash_withdrawn -= record.amount
            session.withdrawals = [w for w in session.withdrawals if w.id != withdrawal_id]
            await session.save()
            return True
    return False


async def get_session_summary(cashier_id: str):
    """Get the current session summary including withdrawals list."""
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if not session:
        return None
        
    return {
        "opening_float": session.opening_float,
        "net_cash_collected": session.net_cash_collected,
        "total_cash_withdrawn": session.total_cash_withdrawn,
        "withdrawals": session.withdrawals or [],
        "expected_closing_float": session.opening_float + session.net_cash_collected - session.total_cash_withdrawn
    }
