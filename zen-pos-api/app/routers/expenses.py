from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import require_permission
from app.models.expense import ManualExpenseDocument, EXPENSE_CATEGORIES
from app.core.exceptions import NotFoundError

router = APIRouter()


class ExpenseCreate(BaseModel):
    category: str
    title: str
    amount: float
    date: str
    notes: str = ""


class ExpenseOut(BaseModel):
    id: str
    category: str
    title: str
    amount: float
    date: str
    notes: str


def _to_out(e: ManualExpenseDocument) -> ExpenseOut:
    return ExpenseOut(
        id=str(e.id),
        category=e.category,
        title=e.title,
        amount=e.amount,
        date=e.date,
        notes=e.notes,
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
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Invalid category. Choose from: {EXPENSE_CATEGORIES}")
    expense = ManualExpenseDocument(
        category=body.category,
        title=body.title,
        amount=body.amount,
        date=body.date,
        notes=body.notes,
    )
    await expense.insert()
    return _to_out(expense)


@router.delete("/{expense_id}", status_code=204,
               dependencies=[Depends(require_permission("view_hr"))])
async def delete_expense(expense_id: str):
    expense = await ManualExpenseDocument.get(expense_id)
    if not expense:
        raise NotFoundError("Expense not found")
    await expense.delete()
