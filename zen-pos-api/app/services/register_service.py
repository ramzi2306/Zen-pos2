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

async def record_cash_withdrawal(
    cashier_id: str,
    amount: float,
    notes: Optional[str] = None,
    category: str = "other",
    reference_id: Optional[str] = None,
    reference_label: Optional[str] = None,
):
    """Increment total_cash_withdrawn and record the withdrawal entry for the active session."""
    from app.models.register import WithdrawalRecord
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if session:
        session.total_cash_withdrawn += amount
        if session.withdrawals is None:
            session.withdrawals = []
        session.withdrawals.append(WithdrawalRecord(
            amount=amount,
            notes=notes,
            category=category,
            reference_id=reference_id,
            reference_label=reference_label,
        ))
        await session.save()

async def delete_cash_withdrawal(cashier_id: str, withdrawal_id: str):
    """Remove a withdrawal record and decrement the total withdrawn amount."""
    session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == cashier_id,
        RegisterSessionDocument.status == "OPEN"
    )
    if session and session.withdrawals:
        record = None
        for w in session.withdrawals:
            w_id = getattr(w, 'id', None) if hasattr(w, 'id') else w.get('id')
            if str(w_id) == str(withdrawal_id):
                record = w
                break

        if record:
            session.total_cash_withdrawn -= (getattr(record, 'amount', 0) if hasattr(record, 'amount') else record.get('amount', 0))
            new_withdrawals = []
            for w in session.withdrawals:
                w_id = getattr(w, 'id', None) if hasattr(w, 'id') else w.get('id')
                if str(w_id) != str(withdrawal_id):
                    new_withdrawals.append(w)
            session.withdrawals = new_withdrawals
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

    withdrawals = []
    if session.withdrawals:
        import uuid
        for w in session.withdrawals:
            w_id = getattr(w, 'id', None) if hasattr(w, 'id') else w.get('id')
            w_amount = getattr(w, 'amount', 0) if hasattr(w, 'amount') else w.get('amount', 0)
            w_notes = getattr(w, 'notes', None) if hasattr(w, 'notes') else w.get('notes')
            w_category = getattr(w, 'category', 'other') if hasattr(w, 'category') else w.get('category', 'other')
            w_ref_id = getattr(w, 'reference_id', None) if hasattr(w, 'reference_id') else w.get('reference_id')
            w_ref_label = getattr(w, 'reference_label', None) if hasattr(w, 'reference_label') else w.get('reference_label')

            if not w_id:
                w_id = str(uuid.uuid4())

            withdrawals.append({
                "id": str(w_id),
                "amount": float(w_amount),
                "notes": w_notes,
                "category": w_category,
                "reference_id": w_ref_id,
                "reference_label": w_ref_label,
            })

    return {
        "opening_float": session.opening_float,
        "net_cash_collected": session.net_cash_collected,
        "total_cash_withdrawn": session.total_cash_withdrawn,
        "withdrawals": withdrawals,
        "expected_closing_float": session.opening_float + session.net_cash_collected - session.total_cash_withdrawn
    }
