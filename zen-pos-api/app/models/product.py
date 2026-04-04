from typing import Annotated, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING


class Ingredient(BaseModel):
    id: str
    name: str
    amount: float
    unit: str
    waste_percent: Optional[float] = None


class SupplementOption(BaseModel):
    id: str
    name: str
    price_adjustment: Optional[float] = None
    ingredients: list[Ingredient] = Field(default_factory=list)

class SupplementGroup(BaseModel):
    id: str
    name: str
    options: list[SupplementOption] = Field(default_factory=list)

class VariationOption(BaseModel):
    id: str
    name: str
    price: Optional[float] = None
    ingredients: list[Ingredient] = Field(default_factory=list)


class VariationGroup(BaseModel):
    id: str
    name: str
    options: list[VariationOption] = Field(default_factory=list)


class CategoryDocument(Document):
    name: Annotated[str, Indexed(unique=True)]

    class Settings:
        name = "categories"
        indexes = [IndexModel([("name", ASCENDING)], unique=True)]


class ProductDocument(Document):
    name: str
    description: str = ""
    price: float
    category: str
    image: str = ""
    in_stock: bool = True
    stock_level: Optional[str] = None          # Healthy | Low | Critical
    tags: list[str] = Field(default_factory=list)
    variations: list[VariationGroup] = Field(default_factory=list)
    supplements: list[SupplementGroup] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)
    is_active: bool = True

    class Settings:
        name = "products"
        indexes = [
            IndexModel([("category", ASCENDING)]),
            IndexModel([("is_active", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("category", ASCENDING)]),
        ]
