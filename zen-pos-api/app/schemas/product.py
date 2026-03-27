from typing import Optional
from pydantic import BaseModel


class IngredientSchema(BaseModel):
    id: str
    name: str
    amount: float
    unit: str
    waste_percent: Optional[float] = None


class VariationOptionSchema(BaseModel):
    id: str
    name: str
    price_adjustment: Optional[float] = None
    ingredients: list[IngredientSchema] = []


class VariationGroupSchema(BaseModel):
    id: str
    name: str
    options: list[VariationOptionSchema] = []


class ProductOut(BaseModel):
    id: str
    name: str
    description: str
    price: float
    category: str
    image: str
    in_stock: bool
    stock_level: Optional[str]
    tags: list[str]
    variations: list[VariationGroupSchema]


class ProductCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    category: str
    image: str = ""
    in_stock: bool = True
    stock_level: Optional[str] = None
    tags: list[str] = []
    variations: list[VariationGroupSchema] = []
    ingredients: list[IngredientSchema] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    image: Optional[str] = None
    in_stock: Optional[bool] = None
    stock_level: Optional[str] = None
    tags: Optional[list[str]] = None
    variations: Optional[list[VariationGroupSchema]] = None


class CategoryOut(BaseModel):
    id: str
    name: str


class CategoryCreate(BaseModel):
    name: str
