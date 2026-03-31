from typing import List, Optional

from fastapi import APIRouter, Depends

from app.dependencies import require_permission
from app.models.customer import CustomerDocument
from app.models.order import OrderDocument
from app.schemas.customer import CustomerOut, CustomerDetailOut, CustomerOrderOut
from app.core.exceptions import NotFoundError

router = APIRouter()


@router.get("/", response_model=List[CustomerOut],
            dependencies=[Depends(require_permission("view_orders"))])
async def list_customers(search: Optional[str] = None):
    customers = await CustomerDocument.find_all().to_list()

    # Enrich with order stats
    result = []
    for c in customers:
        if search:
            s = search.lower()
            if s not in c.name.lower() and s not in c.phone:
                continue
        orders = await OrderDocument.find(
            OrderDocument.customer.phone == c.phone,
            OrderDocument.status != "Cancelled",
        ).to_list()
        last_order = max((o.created_at for o in orders), default=None) if orders else None
        result.append(CustomerOut(
            id=str(c.id),
            name=c.name,
            phone=c.phone,
            address=c.address,
            notes=c.notes,
            created_at=c.created_at,
            order_count=len(orders),
            total_spent=round(sum(o.total for o in orders), 2),
            last_order_date=last_order,
        ))

    result.sort(key=lambda x: x.last_order_date or x.created_at, reverse=True)
    return result


@router.get("/{customer_id}", response_model=CustomerDetailOut,
            dependencies=[Depends(require_permission("view_orders"))])
async def get_customer(customer_id: str):
    customer = await CustomerDocument.get(customer_id)
    if not customer:
        raise NotFoundError("Customer not found")

    orders = await OrderDocument.find(
        OrderDocument.customer.phone == customer.phone,
    ).sort("-created_at").to_list()

    order_outs = [
        CustomerOrderOut(
            id=str(o.id),
            order_number=o.order_number,
            created_at=getattr(o, "created_at", None),
            total=o.total,
            status=o.status,
            order_type=o.order_type,
            items_count=sum(i.quantity for i in o.items),
            review={"stars": o.review.stars, "comment": o.review.comment} if o.review else None,
        )
        for o in orders
    ]

    non_cancelled = [o for o in orders if o.status != "Cancelled"]
    return CustomerDetailOut(
        id=str(customer.id),
        name=customer.name,
        phone=customer.phone,
        address=customer.address,
        notes=customer.notes,
        created_at=customer.created_at,
        order_count=len(non_cancelled),
        total_spent=round(sum(o.total for o in non_cancelled), 2),
        last_order_date=max((o.created_at for o in non_cancelled), default=None) if non_cancelled else None,
        orders=order_outs,
    )

@router.delete("/{customer_id}", status_code=204,
               dependencies=[Depends(require_permission("view_orders"))])
async def delete_customer(customer_id: str):
    customer = await CustomerDocument.get(customer_id)
    if not customer:
        raise NotFoundError("Customer not found")
    await customer.delete()
