from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.dependencies import require_permission
from app.models.product import ProductDocument
from app.core.exceptions import NotFoundError

router = APIRouter()


class StockUpdate(BaseModel):
    in_stock: Optional[bool] = None
    stock_level: Optional[str] = None         # Healthy | Low | Critical


class InventoryItemOut(BaseModel):
    id: str
    name: str
    category: str
    price: float
    in_stock: bool
    stock_level: Optional[str]


@router.get("/", response_model=list[InventoryItemOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_inventory():
    products = await ProductDocument.find(ProductDocument.is_active == True).to_list()  # noqa: E712
    return [
        InventoryItemOut(
            id=str(p.id),
            name=p.name,
            category=p.category,
            price=p.price,
            in_stock=p.in_stock,
            stock_level=p.stock_level,
        )
        for p in products
    ]


@router.get("/low-stock", response_model=list[InventoryItemOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def low_stock():
    products = await ProductDocument.find(
        ProductDocument.stock_level.in_(["Low", "Critical"]),  # type: ignore[attr-defined]
        ProductDocument.is_active == True,  # noqa: E712
    ).to_list()
    return [
        InventoryItemOut(
            id=str(p.id),
            name=p.name,
            category=p.category,
            price=p.price,
            in_stock=p.in_stock,
            stock_level=p.stock_level,
        )
        for p in products
    ]


@router.patch("/{product_id}", response_model=InventoryItemOut,
              dependencies=[Depends(require_permission("view_inventory"))])
async def update_stock(product_id: str, body: StockUpdate):
    product = await ProductDocument.get(product_id)
    if not product:
        raise NotFoundError("Product not found")
    if body.in_stock is not None:
        product.in_stock = body.in_stock
    if body.stock_level is not None:
        product.stock_level = body.stock_level
    await product.save()
    return InventoryItemOut(
        id=str(product.id),
        name=product.name,
        category=product.category,
        price=product.price,
        in_stock=product.in_stock,
        stock_level=product.stock_level,
    )
