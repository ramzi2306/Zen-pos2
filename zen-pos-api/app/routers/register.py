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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/reports", response_model=RegisterReportOut, status_code=201,
             dependencies=[Depends(require_permission("view_orders"))])
async def submit_register_report(body: RegisterReportCreate, current_user=Depends(require_permission("view_orders"))):
    """Called automatically when a cashier closes their register."""
    from app.models.register import RegisterSessionDocument
    from datetime import datetime, timezone

    report = RegisterReportDocument(
        opened_at=body.opened_at,
        closed_at=body.closed_at,
        cashier_name=body.cashier_name,
        expected_sales=body.expected_sales,
        actual_sales=body.actual_sales,
        difference=body.difference,
        notes=body.notes,
        location_id=body.location_id,
    )
    await report.insert()

    # Close active RegisterSession for this cashier if it exists
    open_session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == str(current_user.id),
        RegisterSessionDocument.status == "OPEN"
    )
    if open_session:
        open_session.status = "CLOSED"
        open_session.closed_at = datetime.now(timezone.utc)
        await open_session.save()

    return _to_out(report)


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


def _to_out(r: RegisterReportDocument) -> RegisterReportOut:
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
    )
