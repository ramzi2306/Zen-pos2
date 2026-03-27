from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.dependencies import require_permission
from app.models.ingredient import IngredientInventoryDocument, PurchaseLogDocument, UsageLogDocument
from app.schemas.ingredient import (
    IngredientOut, IngredientCreate, IngredientUpdate,
    PurchaseLogCreate, PurchaseLogOut,
    UsageLogCreate, UsageLogOut,
)
from app.core.exceptions import NotFoundError

router = APIRouter()


def _ing_to_out(i: IngredientInventoryDocument) -> IngredientOut:
    return IngredientOut(
        id=str(i.id),
        name=i.name,
        sku=i.sku,
        category=i.category,
        unit=i.unit,
        in_stock=i.in_stock,
        capacity=i.capacity,
        price_per_unit=i.price_per_unit,
        icon=i.icon,
        stock_level=i.stock_level,
        level_pct=i.level_pct,
    )


# ── Ingredient CRUD ────────────────────────────────────────

@router.get("/", response_model=list[IngredientOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_ingredients():
    items = await IngredientInventoryDocument.find(
        IngredientInventoryDocument.is_active == True  # noqa: E712
    ).to_list()
    return [_ing_to_out(i) for i in items]


@router.post("/", response_model=IngredientOut, status_code=201,
             dependencies=[Depends(require_permission("view_inventory"))])
async def create_ingredient(body: IngredientCreate):
    doc = IngredientInventoryDocument(**body.model_dump())
    await doc.insert()
    return _ing_to_out(doc)


@router.patch("/{ingredient_id}", response_model=IngredientOut,
              dependencies=[Depends(require_permission("view_inventory"))])
async def update_ingredient(ingredient_id: str, body: IngredientUpdate):
    doc = await IngredientInventoryDocument.get(ingredient_id)
    if not doc:
        raise NotFoundError("Ingredient not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    await doc.save()
    return _ing_to_out(doc)


@router.delete("/{ingredient_id}", status_code=204,
               dependencies=[Depends(require_permission("view_inventory"))])
async def delete_ingredient(ingredient_id: str):
    doc = await IngredientInventoryDocument.get(ingredient_id)
    if not doc:
        raise NotFoundError("Ingredient not found")
    doc.is_active = False
    await doc.save()


# ── Purchase Logs ──────────────────────────────────────────

@router.get("/purchases/", response_model=list[PurchaseLogOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_purchases():
    logs = await PurchaseLogDocument.find_all().sort("-date").to_list()
    result = []
    for log in logs:
        await log.fetch_all_links()
        ing = log.ingredient
        result.append(PurchaseLogOut(
            id=str(log.id),
            ingredient_id=str(ing.id) if ing else "",
            ingredient_name=ing.name if ing else "",
            vendor=log.vendor,
            quantity=log.quantity,
            unit=log.unit,
            total_cost=log.total_cost,
            date=log.date,
        ))
    return result


@router.post("/purchases/", response_model=PurchaseLogOut, status_code=201,
             dependencies=[Depends(require_permission("view_inventory"))])
async def log_purchase(body: PurchaseLogCreate):
    ing = await IngredientInventoryDocument.get(body.ingredient_id)
    if not ing:
        raise NotFoundError("Ingredient not found")

    # Add to stock
    ing.in_stock = round(ing.in_stock + body.quantity, 4)
    await ing.save()

    log = PurchaseLogDocument(
        ingredient=ing,
        vendor=body.vendor,
        quantity=body.quantity,
        unit=ing.unit,
        total_cost=body.total_cost,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    await log.insert()

    return PurchaseLogOut(
        id=str(log.id),
        ingredient_id=str(ing.id),
        ingredient_name=ing.name,
        vendor=log.vendor,
        quantity=log.quantity,
        unit=log.unit,
        total_cost=log.total_cost,
        date=log.date,
    )


# ── Usage Logs ─────────────────────────────────────────────

@router.get("/usage/", response_model=list[UsageLogOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_usage():
    logs = await UsageLogDocument.find_all().sort("-date").to_list()
    result = []
    for log in logs:
        await log.fetch_all_links()
        ing = log.ingredient
        result.append(UsageLogOut(
            id=str(log.id),
            ingredient_id=str(ing.id) if ing else "",
            ingredient_name=ing.name if ing else "",
            quantity=log.quantity,
            unit=log.unit,
            reason=log.reason,
            date=log.date,
        ))
    return result


@router.post("/usage/", response_model=UsageLogOut, status_code=201,
             dependencies=[Depends(require_permission("view_inventory"))])
async def log_usage(body: UsageLogCreate):
    ing = await IngredientInventoryDocument.get(body.ingredient_id)
    if not ing:
        raise NotFoundError("Ingredient not found")

    # Deduct from stock (floor at 0)
    ing.in_stock = max(0, round(ing.in_stock - body.quantity, 4))
    await ing.save()

    log = UsageLogDocument(
        ingredient=ing,
        quantity=body.quantity,
        unit=ing.unit,
        reason=body.reason,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    await log.insert()

    return UsageLogOut(
        id=str(log.id),
        ingredient_id=str(ing.id),
        ingredient_name=ing.name,
        quantity=log.quantity,
        unit=log.unit,
        reason=log.reason,
        date=log.date,
    )
