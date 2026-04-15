import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

from app.core.exceptions import NotFoundError, BadRequestError
from app.models.order import OrderDocument, OrderItem, CustomerInfo, SelectedVariation
from app.models.user import UserDocument
from app.schemas.order import OrderCreate, OrderUpdate

VALID_TRANSITIONS: dict[str, list[str]] = {
    "Draft":            ["Queued", "Cancelled"],
    "Queued":           ["Queued", "Preparing", "Scheduled", "Cancelled"],
    "Scheduled":        ["Queued", "Cancelled"],
    "Preparing":        ["Queued", "Served", "Packaging", "Cancelled"],
    "Served":           ["Done", "Packaging"],
    "Packaging":        ["Out for delivery", "Done"],
    "Out for delivery": ["Done"],
    "Verification":     ["Queued", "Cancelled"],
    "Cancelled":        [],
    "Done":             [],
}


async def recalculate_order_totals(order: OrderDocument) -> None:
    """Recalculate subtotal, tax, and total for an order based on its items and current settings."""
    subtotal = round(sum(item.line_total for item in order.items), 2)

    from app.models.settings import LocalizationDocument
    localization = await LocalizationDocument.find_one({"key": "localization"})
    tax_rate = (localization.tax_rate / 100) if localization and localization.tax_enabled else 0.0
    gratuity_rate = (localization.gratuity_rate / 100) if localization and localization.gratuity_enabled else 0.0
    
    tax = round(subtotal * tax_rate, 2)
    gratuity = round(subtotal * gratuity_rate, 2)
    total = round(subtotal + tax + gratuity, 2)

    order.subtotal = subtotal
    order.tax = tax
    order.total = total


async def create_order(data: OrderCreate, location_id: Optional[str] = None) -> OrderDocument:
    from app.models.product import ProductDocument

    # Build a product_id → category lookup in a single query
    product_ids = [i.product_id for i in data.items]
    products = await ProductDocument.find({"_id": {"$in": [__import__('bson').ObjectId(pid) for pid in product_ids if len(pid) == 24]}}).to_list()
    category_map = {str(p.id): p.category for p in products}
    image_map = {str(p.id): getattr(p, "image", "") for p in products}

    items = [
        OrderItem(
            product_id=i.product_id,
            product_name=i.product_name,
            category=category_map.get(i.product_id, ""),
            image=image_map.get(i.product_id, ""),
            unit_price=i.unit_price,
            quantity=i.quantity,
            notes=i.notes,
            discount=i.discount,
            manual_price=i.manual_price,
            selected_variations=[
                SelectedVariation(**v.model_dump()) for v in i.selected_variations
            ],
        )
        for i in data.items
    ]

    customer_info = CustomerInfo(**data.customer.model_dump())

    order_number = await _generate_order_number()
    order = OrderDocument(
        order_number=order_number,
        table=data.table,
        status=data.status,
        payment_status=data.payment_status,
        payment_method=data.payment_method,
        order_type=data.order_type,
        items=items,
        # totals set below via recalculate
        customer=customer_info,
        scheduled_time=data.scheduled_time,
        notes=data.notes,
        is_urgent=data.is_urgent,
        location_id=location_id,
        tracking_token=str(uuid.uuid4()),
    )
    await recalculate_order_totals(order)

    # Duplicate detection: same customer phone + same products within 60 seconds
    if customer_info.phone and data.status != "Draft":
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
        from beanie.operators import NotIn
        recent = await OrderDocument.find(
            OrderDocument.created_at >= cutoff,
            NotIn(OrderDocument.status, ["Cancelled", "Draft"]),
        ).to_list()
        new_pids = sorted(i.product_id for i in items)
        for ro in recent:
            if ro.customer.phone == customer_info.phone and ro.status not in ("Cancelled", "Draft"):
                ro_pids = sorted(i.product_id for i in ro.items)
                if new_pids == ro_pids:
                    raise BadRequestError(
                        "Duplicate order detected. Please wait before placing the same order again."
                    )

    await order.insert()

    # Auto-upsert customer record when phone is provided
    if customer_info.phone:
        await _upsert_customer(customer_info)

    # Broadcast new order event to all connected clients
    from app.ws.manager import manager as ws_manager
    await ws_manager.broadcast("new_order", {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "table": order.table,
        "order_type": order.order_type,
        "is_urgent": order.is_urgent,
        "message": f"New order {order.order_number} received",
    })

    return order


async def _upsert_customer(info: "CustomerInfo") -> None:
    from app.models.customer import CustomerDocument
    existing = await CustomerDocument.find_one(CustomerDocument.phone == info.phone)
    if existing:
        # Always update name and address if provided
        if info.name:
            existing.name = info.name
        if info.address:
            existing.address = info.address
        await existing.save()
    else:
        await CustomerDocument(
            name=info.name or info.phone,
            phone=info.phone,
            address=info.address,
        ).insert()


async def transition_status(order_id: str, new_status: str, scheduled_time: Optional[str] = None) -> OrderDocument:
    order = await OrderDocument.get(order_id)
    if not order:
        raise NotFoundError("Order not found")

    allowed = VALID_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        raise BadRequestError(
            f"Cannot transition order from '{order.status}' to '{new_status}'"
        )

    if new_status == "Preparing":
        if not order.cook:
            raise BadRequestError("Assign a cook before starting preparation")
        if not order.start_time:
            order.start_time = int(time.time() * 1000)

    if order.status == "Preparing" and new_status != "Preparing":
        order.end_time = int(time.time() * 1000)

    if new_status == "Scheduled" and scheduled_time:
        order.scheduled_time = scheduled_time

    order.status = new_status
    await order.save()
    if new_status == "Done":
        await _decrement_ingredients(order)

    # Broadcast status change
    from app.ws.manager import manager as ws_manager
    event_type = "urgent" if order.is_urgent and new_status in ("Queued", "Preparing") else "status_update"
    
    # Trackers for this specific order
    track_topic = f"track_{order.tracking_token}" if order.tracking_token else None

    await ws_manager.broadcast(event_type, {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": new_status,
        "is_urgent": order.is_urgent,
        "message": f"Order {order.order_number} is now {new_status}",
    }, topic=track_topic)

    return order


async def assign_cook(order_id: str, cook_id: str) -> OrderDocument:
    order = await OrderDocument.get(order_id)
    if not order:
        raise NotFoundError("Order not found")
    cook = await UserDocument.get(cook_id)
    if not cook:
        raise NotFoundError("Cook not found")
    order.cook = cook
    await order.save()
    return order


async def add_assistant(order_id: str, user_id: str) -> OrderDocument:
    order = await OrderDocument.get(order_id)
    if not order:
        raise NotFoundError("Order not found")
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    existing_ids = [str(a.ref.id) for a in order.assistants if hasattr(a, "ref")]
    if user_id not in existing_ids:
        order.assistants.append(user)  # type: ignore[arg-type]
        await order.save()
    return order


async def submit_review(order_id: str, stars: int, comment: str) -> OrderDocument:
    from app.models.order import Review
    order = await OrderDocument.get(order_id)
    if not order:
        raise NotFoundError("Order not found")
    order.review = Review(stars=stars, comment=comment)
    was_done = order.status == "Done"
    if order.status in ("Served", "Packaging", "Out for delivery"):
        order.status = "Done"
    await order.save()
    if order.status == "Done" and not was_done:
        await _decrement_ingredients(order)
    return order


async def _decrement_ingredients(order: "OrderDocument") -> None:
    """Subtract ingredient stock for every item in a completed order."""
    from app.models.ingredient import IngredientInventoryDocument, UsageLogDocument
    from app.models.product import ProductDocument
    from datetime import date

    product_ids = [
        __import__('bson').ObjectId(i.product_id)
        for i in order.items
        if len(i.product_id) == 24
    ]
    if not product_ids:
        return

    products = await ProductDocument.find({"_id": {"$in": product_ids}}).to_list()
    product_map = {str(p.id): p for p in products}
    today = date.today().isoformat()

    for item in order.items:
        product = product_map.get(item.product_id)
        if not product or not product.ingredients:
            continue
        for ing_ref in product.ingredients:
            try:
                ingredient = await IngredientInventoryDocument.get(ing_ref.id)
                if not ingredient:
                    continue
                used = ing_ref.amount * item.quantity
                ingredient.in_stock = max(0.0, ingredient.in_stock - used)
                await ingredient.save()
                await UsageLogDocument(
                    ingredient=ingredient,  # type: ignore[arg-type]
                    quantity=used,
                    unit=ing_ref.unit or ingredient.unit,
                    reason="Service",
                    date=today,
                ).insert()
            except Exception as e:
                logger.warning("Inventory update failed for item %s: %s", item.product_id, e)


async def _generate_order_number() -> str:
    """Generate a short sequential order number like #0001, #0042."""
    count = await OrderDocument.count()
    return f"#{count + 1:04d}"
