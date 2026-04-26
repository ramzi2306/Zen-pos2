from datetime import date as DateType
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from dateutil.relativedelta import relativedelta

from app.dependencies import require_permission
from app.models.expense import ManualExpenseDocument, EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES
from app.core.exceptions import NotFoundError

router = APIRouter()


def _next_occurrence(from_date: str, frequency: str) -> str:
    d = DateType.fromisoformat(from_date)
    if frequency == "monthly":
        return (d + relativedelta(months=1)).isoformat()
    if frequency == "quarterly":
        return (d + relativedelta(months=3)).isoformat()
    if frequency == "yearly":
        return (d + relativedelta(years=1)).isoformat()
    raise ValueError(f"Unknown frequency: {frequency}")


class ExpenseCreate(BaseModel):
    category: str
    title: str
    amount: float
    date: str
    notes: str = ""
    is_recurring: bool = False
    frequency: Optional[str] = None   # monthly | quarterly | yearly


class ExpenseOut(BaseModel):
    id: str
    category: str
    title: str
    amount: float
    date: str
    notes: str
    is_recurring: bool
    frequency: Optional[str]
    next_occurrence: Optional[str]
    is_paused: bool


def _to_out(e: ManualExpenseDocument) -> ExpenseOut:
    return ExpenseOut(
        id=str(e.id),
        category=e.category,
        title=e.title,
        amount=e.amount,
        date=e.date,
        notes=e.notes,
        is_recurring=e.is_recurring,
        frequency=e.frequency,
        next_occurrence=e.next_occurrence,
        is_paused=e.is_paused,
    )


@router.get("/categories", response_model=List[str])
async def list_categories():
    return EXPENSE_CATEGORIES


@router.get("", response_model=List[ExpenseOut],
            dependencies=[Depends(require_permission("view_hr"))])
async def list_expenses(start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = ManualExpenseDocument.find()
    if start_date:
        query = query.find(ManualExpenseDocument.date >= start_date)
    if end_date:
        query = query.find(ManualExpenseDocument.date <= end_date)
    records = await query.sort("-date").to_list()
    return [_to_out(e) for e in records]


@router.post("", response_model=ExpenseOut, status_code=201,
             dependencies=[Depends(require_permission("view_hr"))])
async def create_expense(body: ExpenseCreate):
    if body.category not in EXPENSE_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Invalid category. Choose from: {EXPENSE_CATEGORIES}")
    if body.is_recurring:
        if not body.frequency or body.frequency not in EXPENSE_FREQUENCIES:
            raise HTTPException(status_code=422, detail=f"Frequency must be one of: {EXPENSE_FREQUENCIES}")
        next_occ = _next_occurrence(body.date, body.frequency)
    else:
        next_occ = None

    expense = ManualExpenseDocument(
        category=body.category,
        title=body.title,
        amount=body.amount,
        date=body.date,
        notes=body.notes,
        is_recurring=body.is_recurring,
        frequency=body.frequency if body.is_recurring else None,
        next_occurrence=next_occ,
    )
    await expense.insert()
    return _to_out(expense)


@router.patch("/{expense_id}/pause", response_model=ExpenseOut,
              dependencies=[Depends(require_permission("view_hr"))])
async def toggle_pause_expense(expense_id: str):
    expense = await ManualExpenseDocument.get(expense_id)
    if not expense:
        raise NotFoundError("Expense not found")
    expense.is_paused = not expense.is_paused
    await expense.save()
    return _to_out(expense)


@router.delete("/{expense_id}", status_code=204,
               dependencies=[Depends(require_permission("view_hr"))])
async def delete_expense(expense_id: str):
    expense = await ManualExpenseDocument.get(expense_id)
    if not expense:
        raise NotFoundError("Expense not found")
    await expense.delete()
