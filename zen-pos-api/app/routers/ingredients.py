from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import require_permission
from app.models.ingredient import IngredientInventoryDocument, PurchaseLogDocument, UsageLogDocument, RecurringUsageDocument
from app.schemas.ingredient import (
    IngredientOut, IngredientCreate, IngredientUpdate,
    PurchaseLogCreate, PurchaseLogOut,
    UsageLogCreate, UsageLogOut,
    StockAdjustRequest,
)
from app.core.exceptions import NotFoundError
from app.ws.manager import manager

router = APIRouter()


def _ing_to_out(i: IngredientInventoryDocument) -> IngredientOut:
    return IngredientOut(
        id=str(i.id),
        name=i.name,
        sku=i.sku,
        category=i.category,
        unit=i.unit,
        in_stock=i.in_stock,
        min_stock=i.min_stock,
        capacity=i.capacity,
        price_per_unit=i.price_per_unit,
        icon=i.icon,
        stock_level=i.stock_level,
        level_pct=i.level_pct,
    )


async def _maybe_alert_low_stock(ing: IngredientInventoryDocument) -> None:
    if ing.min_stock > 0 and ing.in_stock <= ing.min_stock:
        await manager.broadcast("low_stock", {
            "ingredient_id": str(ing.id),
            "name": ing.name,
            "in_stock": ing.in_stock,
            "min_stock": ing.min_stock,
            "unit": ing.unit,
        })


# ── Ingredient CRUD ────────────────────────────────────────

@router.get("/", response_model=list[IngredientOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_ingredients():
    items = await IngredientInventoryDocument.find(
        IngredientInventoryDocument.is_active == True  # noqa: E712
    ).to_list()
    return [_ing_to_out(i) for i in items]


@router.post("/", response_model=IngredientOut, status_code=201,
             dependencies=[Depends(require_permission("manage_inventory"))])
async def create_ingredient(body: IngredientCreate):
    doc = IngredientInventoryDocument(**body.model_dump())
    await doc.insert()
    await manager.broadcast("ingredient_update", {"action": "created", "id": str(doc.id)})
    return _ing_to_out(doc)


@router.patch("/{ingredient_id}/adjust", response_model=IngredientOut,
              dependencies=[Depends(require_permission("manage_inventory"))])
async def adjust_stock(ingredient_id: str, body: StockAdjustRequest):
    """Directly set the stock level to an actual counted value."""
    doc = await IngredientInventoryDocument.get(ingredient_id)
    if not doc:
        raise NotFoundError("Ingredient not found")
    doc.in_stock = round(body.actual_stock, 4)
    await doc.save()
    await manager.broadcast("ingredient_update", {
        "action": "adjusted",
        "id": ingredient_id,
        "actual_stock": body.actual_stock,
        "reason": body.reason,
    })
    await _maybe_alert_low_stock(doc)
    return _ing_to_out(doc)


@router.patch("/{ingredient_id}", response_model=IngredientOut,
              dependencies=[Depends(require_permission("manage_inventory"))])
async def update_ingredient(ingredient_id: str, body: IngredientUpdate):
    doc = await IngredientInventoryDocument.get(ingredient_id)
    if not doc:
        raise NotFoundError("Ingredient not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    await doc.save()
    await manager.broadcast("ingredient_update", {"action": "updated", "id": ingredient_id})
    return _ing_to_out(doc)


@router.delete("/{ingredient_id}", status_code=204,
               dependencies=[Depends(require_permission("manage_inventory"))])
async def delete_ingredient(ingredient_id: str):
    doc = await IngredientInventoryDocument.get(ingredient_id)
    if not doc:
        raise NotFoundError("Ingredient not found")
    doc.is_active = False
    await doc.save()
    await manager.broadcast("ingredient_update", {"action": "deleted", "id": ingredient_id})


# ── Purchase Logs ──────────────────────────────────────────

@router.get("/purchases/", response_model=list[PurchaseLogOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_purchases(
    start: Optional[str] = Query(None, description="ISO date filter start (YYYY-MM-DD)"),
    end: Optional[str] = Query(None, description="ISO date filter end (YYYY-MM-DD)"),
):
    query = PurchaseLogDocument.find_all()
    if start:
        query = query.find(PurchaseLogDocument.date >= start)
    if end:
        query = query.find(PurchaseLogDocument.date <= end)
    logs = await query.sort("-date").to_list()
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
             dependencies=[Depends(require_permission("manage_inventory"))])
async def log_purchase(body: PurchaseLogCreate):
    ing = await IngredientInventoryDocument.get(body.ingredient_id)
    if not ing:
        raise NotFoundError("Ingredient not found")

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

    await manager.broadcast("ingredient_update", {"action": "purchase_logged", "ingredient_id": str(ing.id)})
    await _maybe_alert_low_stock(ing)
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
async def list_usage(
    start: Optional[str] = Query(None, description="ISO date filter start (YYYY-MM-DD)"),
    end: Optional[str] = Query(None, description="ISO date filter end (YYYY-MM-DD)"),
):
    query = UsageLogDocument.find_all()
    if start:
        query = query.find(UsageLogDocument.date >= start)
    if end:
        query = query.find(UsageLogDocument.date <= end)
    logs = await query.sort("-date").to_list()
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
             dependencies=[Depends(require_permission("manage_inventory"))])
async def log_usage(body: UsageLogCreate):
    ing = await IngredientInventoryDocument.get(body.ingredient_id)
    if not ing:
        raise NotFoundError("Ingredient not found")

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

    await manager.broadcast("ingredient_update", {"action": "usage_logged", "ingredient_id": str(ing.id)})
    await _maybe_alert_low_stock(ing)
    return UsageLogOut(
        id=str(log.id),
        ingredient_id=str(ing.id),
        ingredient_name=ing.name,
        quantity=log.quantity,
        unit=log.unit,
        reason=log.reason,
        date=log.date,
    )


# ── Categories ─────────────────────────────────────────────

@router.get("/categories/", response_model=list[str],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_categories():
    """Return all distinct category tags across all ingredients."""
    items = await IngredientInventoryDocument.find().to_list()
    seen: set[str] = set()
    for item in items:
        for cat in item.category:
            if cat:
                seen.add(cat.upper())
    return sorted(seen)


# ── Recurring Usages ───────────────────────────────────────

from pydantic import BaseModel as _BaseModel

class RecurringUsageCreate(_BaseModel):
    ingredient_id: str
    quantity: float
    reason: str = "Service"
    frequency: str  # daily | weekly | monthly

class RecurringUsageUpdate(_BaseModel):
    quantity: Optional[float] = None
    reason: Optional[str] = None
    frequency: Optional[str] = None
    is_paused: Optional[bool] = None

class RecurringUsageOut(_BaseModel):
    id: str
    ingredient_id: str
    ingredient_name: str
    unit: str
    quantity: float
    reason: str
    frequency: str
    next_run: str
    is_paused: bool


def _next_run_date(from_date: str, frequency: str) -> str:
    from datetime import date, timedelta
    import calendar
    d = date.fromisoformat(from_date)
    if frequency == "daily":
        return (d + timedelta(days=1)).isoformat()
    if frequency == "weekly":
        return (d + timedelta(weeks=1)).isoformat()
    # monthly
    month = d.month + 1 if d.month < 12 else 1
    year = d.year + 1 if d.month == 12 else d.year
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day).isoformat()


def _rec_to_out(r: RecurringUsageDocument, ing) -> RecurringUsageOut:
    return RecurringUsageOut(
        id=str(r.id),
        ingredient_id=str(ing.id) if ing else "",
        ingredient_name=ing.name if ing else "",
        unit=ing.unit if ing else r.unit,
        quantity=r.quantity,
        reason=r.reason,
        frequency=r.frequency,
        next_run=r.next_run,
        is_paused=r.is_paused,
    )


@router.get("/recurring-usage/", response_model=list[RecurringUsageOut],
            dependencies=[Depends(require_permission("view_inventory"))])
async def list_recurring_usages():
    records = await RecurringUsageDocument.find(
        RecurringUsageDocument.is_active == True  # noqa: E712
    ).to_list()
    result = []
    for r in records:
        await r.fetch_all_links()
        result.append(_rec_to_out(r, r.ingredient))
    return result


@router.post("/recurring-usage/", response_model=RecurringUsageOut, status_code=201,
             dependencies=[Depends(require_permission("manage_inventory"))])
async def create_recurring_usage(body: RecurringUsageCreate):
    ing = await IngredientInventoryDocument.get(body.ingredient_id)
    if not ing:
        raise NotFoundError("Ingredient not found")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rec = RecurringUsageDocument(
        ingredient=ing,
        quantity=body.quantity,
        unit=ing.unit,
        reason=body.reason,
        frequency=body.frequency,
        next_run=today,
    )
    await rec.insert()
    return _rec_to_out(rec, ing)


@router.patch("/recurring-usage/{rec_id}", response_model=RecurringUsageOut,
              dependencies=[Depends(require_permission("manage_inventory"))])
async def update_recurring_usage(rec_id: str, body: RecurringUsageUpdate):
    rec = await RecurringUsageDocument.get(rec_id)
    if not rec:
        raise NotFoundError("Recurring usage not found")
    await rec.fetch_all_links()
    if body.quantity is not None:
        rec.quantity = body.quantity
    if body.reason is not None:
        rec.reason = body.reason
    if body.frequency is not None:
        rec.frequency = body.frequency
    if body.is_paused is not None:
        rec.is_paused = body.is_paused
    await rec.save()
    return _rec_to_out(rec, rec.ingredient)


@router.delete("/recurring-usage/{rec_id}", status_code=204,
               dependencies=[Depends(require_permission("manage_inventory"))])
async def delete_recurring_usage(rec_id: str):
    rec = await RecurringUsageDocument.get(rec_id)
    if not rec:
        raise NotFoundError("Recurring usage not found")
    rec.is_active = False
    await rec.save()
