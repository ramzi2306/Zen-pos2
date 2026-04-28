from typing import Optional
from beanie import Document, Link
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING, DESCENDING


class IngredientInventoryDocument(Document):
    name: str
    sku: str = ""
    category: list[str] = Field(default_factory=list)
    unit: str = "kg"
    in_stock: float = 0
    min_stock: float = 0
    capacity: float = 0
    price_per_unit: float = 0
    icon: str = "restaurant"
    is_active: bool = True

    @property
    def stock_level(self) -> str:
        if self.capacity <= 0:
            return "Healthy"
        pct = (self.in_stock / self.capacity) * 100
        if pct <= 10:
            return "Critical"
        if pct <= 30:
            return "Low"
        return "Healthy"

    @property
    def level_pct(self) -> int:
        if self.capacity <= 0:
            return 100
        return min(100, int((self.in_stock / self.capacity) * 100))

    class Settings:
        name = "ingredient_inventory"
        indexes = [IndexModel([("name", ASCENDING)])]


class PurchaseLogDocument(Document):
    ingredient: Link[IngredientInventoryDocument]
    vendor: str = ""
    quantity: float
    unit: str
    total_cost: float = 0
    date: str          # ISO date

    class Settings:
        name = "purchase_logs"
        indexes = [IndexModel([("date", DESCENDING)])]


class UsageLogDocument(Document):
    ingredient: Link[IngredientInventoryDocument]
    quantity: float
    unit: str
    reason: str = "Service"  # Service | Waste | Staff Meal | Spoilage
    date: str

    class Settings:
        name = "usage_logs"
        indexes = [IndexModel([("date", DESCENDING)])]


class RecurringUsageDocument(Document):
    ingredient: Link[IngredientInventoryDocument]
    quantity: float
    unit: str
    reason: str = "Service"
    frequency: str  # daily | weekly | monthly
    next_run: str   # ISO date YYYY-MM-DD
    is_active: bool = True
    is_paused: bool = False

    class Settings:
        name = "recurring_usages"
        indexes = [IndexModel([("next_run", ASCENDING), ("is_paused", ASCENDING)])]
