from typing import List, Optional
from fastapi import APIRouter, Depends, Query

from app.dependencies import require_permission
from app.models.order import OrderDocument
from app.models.user import UserDocument
from app.schemas.order import (
    OrderCreate, OrderUpdate, OrderOut,
    AssignCookRequest, AssignAssistantRequest, ReviewSchema,
)
from app.services import order_service
from app.core.exceptions import NotFoundError
from app.ws.manager import manager

router = APIRouter()


@router.get("/", response_model=list[OrderOut])
async def list_orders(
    status: Optional[str] = None,
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    location_id: Optional[str] = Query(None, description="Override location filter (admin only)"),
    current_user: UserDocument = Depends(require_permission("view_orders")),
):
    from datetime import timezone, datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    from app.models.settings import LocalizationDocument

    query = OrderDocument.find()

    # Scope by location: use user's location, or admin override via ?location_id=
    effective_location = current_user.location_id or location_id
    if effective_location:
        from beanie.operators import Or
        query = query.find(Or(OrderDocument.location_id == effective_location, OrderDocument.location_id == None))

    if status:
        query = query.find(OrderDocument.status == status)

    # Timezone setup
    localization = await LocalizationDocument.find_one({"key": "localization"})
    tz_name = localization.timezone if localization and localization.timezone else "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = timezone.utc

    if date:
        local_date = datetime.fromisoformat(date)
        day_start = local_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz).astimezone(timezone.utc)
        day_end   = local_date.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=tz).astimezone(timezone.utc)
        query = query.find(OrderDocument.created_at >= day_start, OrderDocument.created_at <= day_end)
    elif start_date or end_date:
        if start_date:
            s_date = datetime.fromisoformat(start_date)
            range_start = s_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz).astimezone(timezone.utc)
            query = query.find(OrderDocument.created_at >= range_start)
        if end_date:
            e_date = datetime.fromisoformat(end_date)
            range_end = e_date.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=tz).astimezone(timezone.utc)
            query = query.find(OrderDocument.created_at <= range_end)
    orders = await query.sort("-created_at").to_list()
    return [_to_out(o) for o in orders]


@router.get("/{order_id}", response_model=OrderOut,
            dependencies=[Depends(require_permission("view_orders"))])
async def get_order(order_id: str):
    order = await OrderDocument.get(order_id)
    if not order:
        raise NotFoundError("Order not found")
    return _to_out(order)


@router.post("/", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderCreate,
    current_user: UserDocument = Depends(require_permission("view_menu")),
):
    order = await order_service.create_order(body, location_id=current_user.location_id)
    out = _to_out(order)
    await manager.broadcast("order_update", {"action": "created", "id": str(order.id), "order_number": order.order_number})
    return out


@router.patch("/{order_id}", response_model=OrderOut,
              dependencies=[Depends(require_permission("view_orders"))])
async def update_order(order_id: str, body: OrderUpdate):
    from app.models.order import OrderItem, CustomerInfo, SelectedVariation
    from app.services.order_service import recalculate_order_totals

    order = await OrderDocument.get(order_id)
    if not order:
        raise NotFoundError("Order not found")
    
    if body.status and body.status != order.status:
        order = await order_service.transition_status(order_id, body.status, body.scheduled_time)
    elif body.status and body.scheduled_time:
        order.scheduled_time = body.scheduled_time
    
    if body.items is not None:
        order.items = [
            OrderItem(
                product_id=i.product_id,
                product_name=i.product_name,
                category=i.category,
                image=i.image,
                unit_price=i.unit_price,
                quantity=i.quantity,
                notes=i.notes,
                discount=i.discount,
                manual_price=i.manual_price,
                selected_variations=[
                    SelectedVariation(**v.model_dump()) for v in i.selected_variations
                ],
            )
            for i in body.items
        ]
        await recalculate_order_totals(order)

    if body.customer:
        order.customer = CustomerInfo(**body.customer.model_dump())

    update_data = body.model_dump(exclude_unset=True, exclude={"status", "scheduled_time", "items", "customer"})
    for key, value in update_data.items():
        setattr(order, key, value)
    
    await order.save()
    out = _to_out(order)
    await manager.broadcast("order_update", {"action": "updated", "id": order_id, "status": out.status})
    return out


@router.post("/{order_id}/assign-cook", response_model=OrderOut,
             dependencies=[Depends(require_permission("view_orders"))])
async def assign_cook(order_id: str, body: AssignCookRequest):
    order = await order_service.assign_cook(order_id, body.cook_id)
    await manager.broadcast("order_update", {"action": "updated", "id": order_id})
    return _to_out(order)


@router.post("/{order_id}/assign-assistant", response_model=OrderOut,
             dependencies=[Depends(require_permission("view_orders"))])
async def assign_assistant(order_id: str, body: AssignAssistantRequest):
    order = await order_service.add_assistant(order_id, body.user_id)
    await manager.broadcast("order_update", {"action": "updated", "id": order_id})
    return _to_out(order)


@router.post("/{order_id}/review", response_model=OrderOut,
             dependencies=[Depends(require_permission("view_orders"))])
async def submit_review(order_id: str, body: ReviewSchema):
    order = await order_service.submit_review(order_id, body.stars, body.comment)
    await manager.broadcast("order_update", {"action": "updated", "id": order_id})
    return _to_out(order)


@router.post("/{order_id}/verify", response_model=OrderOut,
             dependencies=[Depends(require_permission("view_orders"))])
async def verify_online_order(order_id: str):
    """Move an online order from Verification → Queued (cashier confirms order)."""
    order = await order_service.transition_status(order_id, "Queued")
    await manager.broadcast("order_update", {"action": "updated", "id": order_id, "status": "Queued"})
    return _to_out(order)


@router.post("/{order_id}/add-to-kitchen", response_model=OrderOut,
             dependencies=[Depends(require_permission("view_orders"))])
async def add_to_kitchen(order_id: str):
    """Move an order to Queued status so kitchen can start preparing it."""
    order = await order_service.transition_status(order_id, "Queued")
    await manager.broadcast("order_update", {"action": "updated", "id": order_id, "status": "Queued"})
    return _to_out(order)


@router.delete("/{order_id}", status_code=204,
               dependencies=[Depends(require_permission("view_orders"))])
async def cancel_order(order_id: str):
    await order_service.transition_status(order_id, "Cancelled")
    await manager.broadcast("order_update", {"action": "updated", "id": order_id, "status": "Cancelled"})


def _link_id(obj) -> Optional[str]:
    """Extract string ID from a Beanie Link (unfetched) or Document (fetched)."""
    if obj is None:
        return None
    if hasattr(obj, "ref"):        # unfetched Link → obj.ref is a DBRef
        return str(obj.ref.id)
    if hasattr(obj, "id"):         # already-fetched Document
        return str(obj.id)
    return None


def _to_out(o: OrderDocument) -> OrderOut:
    from app.schemas.order import OrderItemSchema, CustomerInfoSchema, SelectedVariationSchema, ReviewSchema, DeliveryAgentInfoSchema
    items = [
        OrderItemSchema(
            product_id=i.product_id,
            product_name=i.product_name,
            category=i.category,
            image=i.image,
            unit_price=i.unit_price,
            quantity=i.quantity,
            notes=i.notes,
            discount=i.discount,
            manual_price=i.manual_price,
            selected_variations=[SelectedVariationSchema(**v.model_dump()) for v in i.selected_variations],
        )
        for i in o.items
    ]
    cook_id = _link_id(o.cook)
    assistant_ids = [lid for a in o.assistants if (lid := _link_id(a)) is not None]
    return OrderOut(
        id=str(o.id),
        order_number=o.order_number,
        table=o.table,
        status=o.status,
        payment_status=o.payment_status,
        payment_method=getattr(o, "payment_method", "Cash"),
        items=items,
        subtotal=o.subtotal,
        tax=o.tax,
        total=o.total,
        order_type=o.order_type,
        customer=CustomerInfoSchema(**o.customer.model_dump()),
        scheduled_time=o.scheduled_time,
        start_time=o.start_time,
        end_time=o.end_time,
        is_urgent=o.is_urgent,
        notes=o.notes,
        cook_id=cook_id,
        assistant_ids=assistant_ids,
        review=ReviewSchema(**o.review.model_dump()) if o.review else None,
        tracking_token=o.tracking_token,
        created_at=getattr(o, "created_at", None),
        location_id=o.location_id,
        delivery_agent=DeliveryAgentInfoSchema(**o.delivery_agent.model_dump()) if o.delivery_agent else None,
    )
