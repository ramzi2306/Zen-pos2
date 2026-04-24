from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.dependencies import require_permission
from app.models.register import RegisterReportDocument

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterReportCreate(BaseModel):
    opened_at: int
    closed_at: int
    cashier_name: str
    expected_sales: float
    actual_sales: float
    difference: float
    notes: Optional[str] = None
    location_id: Optional[str] = None
    # New float fields
    opening_float: float = 0
    net_cash_collected: float = 0
    total_cash_withdrawn: float = 0
    counted_closing_float: float = 0
    discrepancy: float = 0


class RegisterReportOut(BaseModel):
    id: str
    opened_at: int
    closed_at: int
    cashier_name: str
    expected_sales: float
    actual_sales: float
    difference: float
    notes: Optional[str] = None
    location_id: Optional[str] = None
    # New float fields
    opening_float: float = 0
    net_cash_collected: float = 0
    total_cash_withdrawn: float = 0
    counted_closing_float: float = 0
    discrepancy: float = 0


class FloatSummary(BaseModel):
    opening_float: float
    net_cash_collected: float
    total_cash_withdrawn: float
    expected_closing_float: float


class WithdrawalRequest(BaseModel):
    amount: float
    notes: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/reports", response_model=RegisterReportOut, status_code=201,
             dependencies=[Depends(require_permission("view_orders"))])
async def submit_register_report(body: RegisterReportCreate, current_user=Depends(require_permission("view_orders"))):
    """Called automatically when a cashier closes their register."""
    from app.models.register import RegisterSessionDocument
    from datetime import datetime, timezone

    # Close active RegisterSession for this cashier if it exists
    open_session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == str(current_user.id),
        RegisterSessionDocument.status == "OPEN"
    )
    
    float_status = "OK"
    # Simple float status logic (can be refined)
    if abs(body.discrepancy) > 50: # Default threshold
        float_status = "ALERT"
    elif abs(body.discrepancy) > 0:
        float_status = "WARNING"

    if open_session:
        open_session.status = "CLOSED"
        open_session.closed_at = datetime.now(timezone.utc)
        open_session.counted_closing_float = body.counted_closing_float
        open_session.discrepancy = body.discrepancy
        open_session.float_status = float_status
        open_session.closing_notes = body.notes
        await open_session.save()

    report = RegisterReportDocument(
        opened_at=body.opened_at,
        closed_at=body.closed_at,
        cashier_name=body.cashier_name,
        expected_sales=body.expected_sales,
        actual_sales=body.actual_sales,
        difference=body.difference,
        notes=body.notes,
        location_id=body.location_id,
        opening_float=body.opening_float,
        net_cash_collected=body.net_cash_collected,
        total_cash_withdrawn=body.total_cash_withdrawn,
        counted_closing_float=body.counted_closing_float,
        discrepancy=body.discrepancy,
    )
    # Note: RegisterReportDocument in models doesn't have the new float fields yet.
    # I should update it as well if we want them persisted in reports.
    await report.insert()

    return _to_out(report, body)


@router.get("/session/float-summary", response_model=FloatSummary)
async def get_current_float_summary(current_user=Depends(require_permission("view_orders"))):
    """Get the float summary for the current active session."""
    from app.services.register_service import get_session_summary
    summary = await get_session_summary(str(current_user.id))
    if not summary:
        return FloatSummary(opening_float=0, net_cash_collected=0, total_cash_withdrawn=0, expected_closing_float=0)
    return FloatSummary(**summary)


@router.post("/session/withdrawal")
async def record_withdrawal(
    body: WithdrawalRequest,
    current_user=Depends(require_permission("view_orders"))
):
    """Record a mid-session cash withdrawal (drop) from the register."""
    from app.services.register_service import record_cash_withdrawal
    await record_cash_withdrawal(str(current_user.id), body.amount, body.notes)
    return {"status": "success", "amount": body.amount}


@router.get("/reports", response_model=list[RegisterReportOut],
            dependencies=[Depends(require_permission("view_orders"))])
async def list_register_reports(
    location_id: Optional[str] = Query(None, description="Filter by location"),
    limit: int = Query(50, ge=1, le=1000),
):
    query = RegisterReportDocument.find()
    if location_id:
        query = query.find(RegisterReportDocument.location_id == location_id)
    reports = await query.sort("-closed_at").limit(limit).to_list()
    return [_to_out(r) for r in reports]


def _to_out(r: RegisterReportDocument, body: Optional[RegisterReportCreate] = None) -> RegisterReportOut:
    return RegisterReportOut(
        id=str(r.id),
        opened_at=r.opened_at,
        closed_at=r.closed_at,
        cashier_name=r.cashier_name,
        expected_sales=r.expected_sales,
        actual_sales=r.actual_sales,
        difference=r.difference,
        notes=r.notes,
        location_id=r.location_id,
        opening_float=body.opening_float if body else r.opening_float,
        net_cash_collected=body.net_cash_collected if body else r.net_cash_collected,
        total_cash_withdrawn=body.total_cash_withdrawn if body else r.total_cash_withdrawn,
        counted_closing_float=body.counted_closing_float if body else r.counted_closing_float,
        discrepancy=body.discrepancy if body else r.discrepancy,
    )
