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


class ManualExpenseDocument(Document):
    category: str        # one of EXPENSE_CATEGORIES
    title: str
    amount: float
    date: str            # YYYY-MM-DD
    notes: str = ""

    class Settings:
        name = "manual_expenses"
        indexes = [
            IndexModel([("date", DESCENDING)]),
            IndexModel([("category", DESCENDING)]),
        ]
