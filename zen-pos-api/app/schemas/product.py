from typing import Optional
from pydantic import BaseModel, field_validator


class IngredientSchema(BaseModel):
    id: str
    name: str
    amount: float
    unit: str
    waste_percent: Optional[float] = None


class SupplementOptionSchema(BaseModel):
    id: str
    name: str
    price_adjustment: Optional[float] = None
    ingredients: list[IngredientSchema] = []

class SupplementGroupSchema(BaseModel):
    id: str
    name: str
    options: list[SupplementOptionSchema] = []

class VariationOptionSchema(BaseModel):
    id: str
    name: str
    price: Optional[float] = None
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
    supplements: list[SupplementGroupSchema]
    ingredients: list[IngredientSchema] = []


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
    supplements: list[SupplementGroupSchema] = []
    ingredients: list[IngredientSchema] = []

    @field_validator('image')
    @classmethod
    def reject_base64(cls, v: str) -> str:
        if v and v.startswith('data:'):
            raise ValueError('Images must be uploaded via /settings/upload first. Store the returned URL, not a base64 data URI.')
        return v


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
    supplements: Optional[list[SupplementGroupSchema]] = None
    ingredients: Optional[list[IngredientSchema]] = None

    @field_validator('image')
    @classmethod
    def reject_base64(cls, v: Optional[str]) -> Optional[str]:
        if v and v.startswith('data:'):
            raise ValueError('Images must be uploaded via /settings/upload first. Store the returned URL, not a base64 data URI.')
        return v


class CategoryOut(BaseModel):
    id: str
    name: str


class CategoryCreate(BaseModel):
    name: str
