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
    opening_float: float = 0
    net_cash_collected: float = 0
    total_cash_withdrawn: float = 0
    counted_closing_float: float = 0
    discrepancy: float = 0


class WithdrawalItem(BaseModel):
    id: str
    amount: float
    notes: Optional[str] = None
    category: str = "other"
    reference_id: Optional[str] = None
    reference_label: Optional[str] = None

class FloatSummary(BaseModel):
    opening_float: float
    net_cash_collected: float
    total_cash_withdrawn: float
    withdrawals: list[WithdrawalItem] = []
    expected_closing_float: float


class WithdrawalRequest(BaseModel):
    amount: float
    notes: Optional[str] = None
    # category: other | salary_advance | purchase
    category: str = "other"
    # salary_advance fields
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    # purchase fields
    ingredient_id: Optional[str] = None
    ingredient_name: Optional[str] = None
    vendor: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None


class AdvanceCandidate(BaseModel):
    id: str
    name: str
    avatar: str
    base_salary: float
    net_payable: float


class IngredientOption(BaseModel):
    id: str
    name: str
    unit: str
    price_per_unit: float
    in_stock: float


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/reports", response_model=RegisterReportOut, status_code=201,
             dependencies=[Depends(require_permission("view_orders"))])
async def submit_register_report(body: RegisterReportCreate, current_user=Depends(require_permission("view_orders"))):
    """Called automatically when a cashier closes their register."""
    from app.models.register import RegisterSessionDocument
    from datetime import datetime, timezone

    open_session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == str(current_user.id),
        RegisterSessionDocument.status == "OPEN"
    )

    float_status = "OK"
    if abs(body.discrepancy) > 50:
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
    await report.insert()

    return _to_out(report, body)


@router.get("/session/float-summary", response_model=FloatSummary)
async def get_current_float_summary(current_user=Depends(require_permission("view_orders"))):
    from app.services.register_service import get_session_summary
    summary = await get_session_summary(str(current_user.id))
    if not summary:
        return FloatSummary(opening_float=0, net_cash_collected=0, total_cash_withdrawn=0, expected_closing_float=0)
    return FloatSummary(**summary)


@router.get("/session/advance-candidates", response_model=list[AdvanceCandidate])
async def list_advance_candidates(current_user=Depends(require_permission("view_orders"))):
    """Return staff with live-computed net payable (not cached payroll_due)."""
    import asyncio
    from app.models.user import UserDocument
    from app.services import payroll_service

    users = await UserDocument.find(UserDocument.is_active == True).to_list()  # noqa: E712

    async def _candidate(u) -> AdvanceCandidate:
        try:
            summary = await payroll_service.get_payroll_summary(str(u.id))
            net = summary.net_payable
        except Exception:
            net = float(u.base_salary or 0)
        return AdvanceCandidate(
            id=str(u.id),
            name=u.name,
            avatar=getattr(u, 'avatar', ''),
            base_salary=u.base_salary or 0,
            net_payable=net,
        )

    return await asyncio.gather(*[_candidate(u) for u in users])


@router.get("/session/ingredient-options", response_model=list[IngredientOption])
async def list_ingredient_options(current_user=Depends(require_permission("view_orders"))):
    """Return active ingredients for purchase withdrawal selection."""
    from app.models.ingredient import IngredientInventoryDocument
    items = await IngredientInventoryDocument.find(
        IngredientInventoryDocument.is_active == True  # noqa: E712
    ).to_list()
    return [
        IngredientOption(
            id=str(i.id),
            name=i.name,
            unit=i.unit,
            price_per_unit=i.price_per_unit,
            in_stock=i.in_stock,
        )
        for i in items
    ]


@router.post("/session/withdrawal")
async def record_withdrawal(
    body: WithdrawalRequest,
    current_user=Depends(require_permission("view_orders"))
):
    from app.services.register_service import record_cash_withdrawal

    reference_id: Optional[str] = None
    reference_label: Optional[str] = None

    if body.category == "salary_advance":
        # Record payroll withdrawal
        from app.schemas.payroll import WithdrawalRequest as PayrollWithdrawalRequest
        from app.services import payroll_service
        if not body.employee_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="employee_id required for salary advance")
        pw = await payroll_service.process_withdrawal(
            PayrollWithdrawalRequest(
                user_id=body.employee_id,
                amount=body.amount,
                admin_notes=f"Cash advance via register by {current_user.name}",
            )
        )
        reference_id = str(pw.id)
        reference_label = f"{body.employee_name or 'Employee'} — salary advance"

    elif body.category == "purchase":
        # Log purchase and update inventory stock
        from app.models.ingredient import IngredientInventoryDocument, PurchaseLogDocument
        from datetime import datetime, timezone
        if not body.ingredient_id or not body.quantity:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="ingredient_id and quantity required for purchase")
        ingredient = await IngredientInventoryDocument.get(body.ingredient_id)
        if not ingredient:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Ingredient not found")
        log = PurchaseLogDocument(
            ingredient=ingredient,
            vendor=body.vendor or "",
            quantity=body.quantity,
            unit=body.unit or ingredient.unit,
            total_cost=body.amount,
            date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        )
        await log.insert()
        ingredient.in_stock = round(ingredient.in_stock + body.quantity, 4)
        await ingredient.save()
        reference_id = str(log.id)
        reference_label = f"{ingredient.name} — {body.quantity}{ingredient.unit}"

    await record_cash_withdrawal(
        cashier_id=str(current_user.id),
        amount=body.amount,
        notes=body.notes,
        category=body.category,
        reference_id=reference_id,
        reference_label=reference_label,
    )
    return {"status": "success", "amount": body.amount, "category": body.category}


@router.delete("/session/withdrawal/{withdrawal_id}")
async def delete_withdrawal(
    withdrawal_id: str,
    current_user=Depends(require_permission("view_orders"))
):
    from app.services.register_service import delete_cash_withdrawal
    success = await delete_cash_withdrawal(str(current_user.id), withdrawal_id)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    return {"status": "success"}


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
