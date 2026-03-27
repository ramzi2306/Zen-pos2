from typing import Optional
from pydantic import BaseModel


class IngredientOut(BaseModel):
    id: str
    name: str
    sku: str
    category: list[str]
    unit: str
    in_stock: float
    capacity: float
    price_per_unit: float
    icon: str
    stock_level: str
    level_pct: int


class IngredientCreate(BaseModel):
    name: str
    sku: str = ""
    category: list[str] = []
    unit: str = "kg"
    in_stock: float = 0
    capacity: float = 0
    price_per_unit: float = 0
    icon: str = "restaurant"


class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[list[str]] = None
    unit: Optional[str] = None
    in_stock: Optional[float] = None
    capacity: Optional[float] = None
    price_per_unit: Optional[float] = None
    icon: Optional[str] = None


class PurchaseLogCreate(BaseModel):
    ingredient_id: str
    vendor: str = ""
    quantity: float
    total_cost: float = 0


class PurchaseLogOut(BaseModel):
    id: str
    ingredient_id: str
    ingredient_name: str
    vendor: str
    quantity: float
    unit: str
    total_cost: float
    date: str


class UsageLogCreate(BaseModel):
    ingredient_id: str
    quantity: float
    reason: str = "Service"


class UsageLogOut(BaseModel):
    id: str
    ingredient_id: str
    ingredient_name: str
    quantity: float
    unit: str
    reason: str
    date: str
