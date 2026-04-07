from typing import List, Optional
from fastapi import APIRouter, Depends, Response

from app.dependencies import get_current_user, require_permission
from app.models.product import ProductDocument, CategoryDocument
from app.schemas.product import ProductCreate, ProductUpdate, ProductOut, CategoryCreate, CategoryOut
from app.core.exceptions import NotFoundError
from app.ws.manager import manager

router = APIRouter()


# ── Categories ─────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(response: Response):
    response.headers["Cache-Control"] = "public, max-age=60"
    cats = await CategoryDocument.find_all().to_list()
    return [CategoryOut(id=str(c.id), name=c.name) for c in cats]


@router.post("/categories", response_model=CategoryOut, status_code=201,
             dependencies=[Depends(require_permission("view_settings"))])
async def create_category(body: CategoryCreate):
    cat = CategoryDocument(name=body.name)
    await cat.insert()
    await manager.broadcast("product_update", {"action": "category_created", "id": str(cat.id)})
    return CategoryOut(id=str(cat.id), name=cat.name)


@router.delete("/categories/{category_id}", status_code=204,
               dependencies=[Depends(require_permission("view_settings"))])
async def delete_category(category_id: str):
    cat = await CategoryDocument.get(category_id)
    if not cat:
        raise NotFoundError("Category not found")
    await cat.delete()
    await manager.broadcast("product_update", {"action": "category_deleted", "id": category_id})


# ── Products ───────────────────────────────────────────────

@router.get("/images")
async def list_product_images(response: Response):
    """Returns only id→image mapping for lazy loading. 24-hour client cache."""
    response.headers["Cache-Control"] = "public, max-age=86400"
    products = await ProductDocument.find({"is_active": True}).to_list()
    return [{"id": str(p.id), "image": p.image or ""} for p in products]


@router.get("/", response_model=list[ProductOut])
async def list_products(response: Response, category: Optional[str] = None, in_stock: Optional[bool] = None):
    response.headers["Cache-Control"] = "public, max-age=30"
    query = ProductDocument.find(ProductDocument.is_active == True)  # noqa: E712
    if category:
        query = query.find(ProductDocument.category == category)
    if in_stock is not None:
        query = query.find(ProductDocument.in_stock == in_stock)
    products = await query.to_list()
    return [_to_out(p, include_image=False) for p in products]


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str):
    product = await ProductDocument.get(product_id)
    if not product:
        raise NotFoundError("Product not found")
    return _to_out(product)


@router.post("/", response_model=ProductOut, status_code=201,
             dependencies=[Depends(require_permission("view_inventory"))])
async def create_product(body: ProductCreate):
    product = ProductDocument(**body.model_dump())
    await product.insert()
    await manager.broadcast("product_update", {"action": "created", "id": str(product.id)})
    return _to_out(product)


@router.patch("/{product_id}", response_model=ProductOut,
              dependencies=[Depends(require_permission("view_inventory"))])
async def update_product(product_id: str, body: ProductUpdate):
    product = await ProductDocument.get(product_id)
    if not product:
        raise NotFoundError("Product not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)
    await product.save()
    await manager.broadcast("product_update", {"action": "updated", "id": product_id})
    return _to_out(product)


@router.delete("/{product_id}", status_code=204,
               dependencies=[Depends(require_permission("view_inventory"))])
async def delete_product(product_id: str):
    product = await ProductDocument.get(product_id)
    if not product:
        raise NotFoundError("Product not found")
    product.is_active = False
    await product.save()
    await manager.broadcast("product_update", {"action": "deleted", "id": product_id})


def _to_out(p: ProductDocument, include_image: bool = True) -> ProductOut:
    variations = [
        {
            "id": vg.id,
            "name": vg.name,
            "options": [
                {
                    "id": opt.id,
                    "name": opt.name,
                    "price": opt.price,
                    "ingredients": [
                        {"id": ing.id, "name": ing.name, "amount": ing.amount, "unit": ing.unit, "waste_percent": ing.waste_percent}
                        for ing in (opt.ingredients or [])
                    ],
                }
                for opt in vg.options
            ],
        }
        for vg in (p.variations or [])
    ]
    supplements = [
        {
            "id": sg.id,
            "name": sg.name,
            "options": [
                {
                    "id": opt.id,
                    "name": opt.name,
                    "price_adjustment": opt.price_adjustment,
                    "ingredients": [
                        {"id": ing.id, "name": ing.name, "amount": ing.amount, "unit": ing.unit, "waste_percent": ing.waste_percent}
                        for ing in (opt.ingredients or [])
                    ],
                }
                for opt in sg.options
            ],
        }
        for sg in (p.supplements or [])
    ]
    ingredients = [
        {"id": ing.id, "name": ing.name, "amount": ing.amount, "unit": ing.unit, "waste_percent": ing.waste_percent}
        for ing in (p.ingredients or [])
    ]
    return ProductOut(
        id=str(p.id),
        name=p.name,
        description=p.description or "",
        price=p.price or 0,
        category=p.category or "",
        image=p.image if include_image else "",
        in_stock=bool(p.in_stock) if p.in_stock is not None else True,
        stock_level=p.stock_level,
        tags=p.tags or [],
        variations=variations,
        supplements=supplements,
        ingredients=ingredients,
    )
