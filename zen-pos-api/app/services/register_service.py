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

async def record_cash_withdrawal(cashier_id: str, amount: float):
    """Increment total_cash_withdrawn for the active session of the given cashier."""
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if session:
        session.total_cash_withdrawn += amount
        await session.save()

async def get_session_summary(cashier_id: str):
    """Get the current session float summary."""
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
        "expected_closing_float": session.opening_float + session.net_cash_collected - session.total_cash_withdrawn
    }
