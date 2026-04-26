from typing import Optional
from beanie import Document
from pymongo import IndexModel, DESCENDING


EXPENSE_CATEGORIES = [
    "Rental",
    "Equipment",
    "Maintenance",
    "Construction",
    "Paperwork",
    "Other",
]

EXPENSE_FREQUENCIES = ["monthly", "quarterly", "yearly"]


class ManualExpenseDocument(Document):
    category: str              # one of EXPENSE_CATEGORIES
    title: str
    amount: float
    date: str                  # YYYY-MM-DD — date of this expense instance
    notes: str = ""
    is_recurring: bool = False
    frequency: Optional[str] = None      # monthly | quarterly | yearly
    next_occurrence: Optional[str] = None  # YYYY-MM-DD — when scheduler fires next
    is_paused: bool = False              # pause without deleting

    class Settings:
        name = "manual_expenses"
        indexes = [
            IndexModel([("date", DESCENDING)]),
            IndexModel([("category", DESCENDING)]),
            IndexModel([("is_recurring", DESCENDING), ("next_occurrence", DESCENDING)]),
        ]
