from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.delivery import DeliveryPlaceDocument, DeliveryAgentDocument, DeliveryAgentInfo
from app.models.order import OrderDocument
from app.schemas.delivery import (
    DeliveryPlaceCreate, DeliveryPlaceUpdate, DeliveryPlaceOut,
    DeliveryAgentCreate, DeliveryAgentUpdate, DeliveryAgentOut,
    AssignAgentRequest,
)
from app.ws.manager import manager

router = APIRouter()


# ── Delivery Places ──────────────────────────────────────────────────────────

@router.get("/places", response_model=list[DeliveryPlaceOut])
async def list_places():
    docs = await DeliveryPlaceDocument.find_all().to_list()
    return [DeliveryPlaceOut(id=str(d.id), name=d.name, wilaya=d.wilaya, delivery_fee=d.delivery_fee, is_active=d.is_active) for d in docs]


@router.get("/places/active", response_model=list[DeliveryPlaceOut])
async def list_active_places():
    """Public endpoint — returns only active delivery zones."""
    docs = await DeliveryPlaceDocument.find(DeliveryPlaceDocument.is_active == True).to_list()
    return [DeliveryPlaceOut(id=str(d.id), name=d.name, wilaya=d.wilaya, delivery_fee=d.delivery_fee, is_active=d.is_active) for d in docs]


@router.post("/places", response_model=DeliveryPlaceOut, dependencies=[Depends(get_current_user)])
async def create_place(data: DeliveryPlaceCreate):
    doc = DeliveryPlaceDocument(**data.model_dump())
    await doc.insert()
    return DeliveryPlaceOut(id=str(doc.id), name=doc.name, wilaya=doc.wilaya, delivery_fee=doc.delivery_fee, is_active=doc.is_active)


@router.put("/places/{place_id}", response_model=DeliveryPlaceOut, dependencies=[Depends(get_current_user)])
async def update_place(place_id: str, data: DeliveryPlaceUpdate):
    doc = await DeliveryPlaceDocument.get(place_id)
    if not doc:
        raise HTTPException(404, "Delivery place not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await doc.save()
    return DeliveryPlaceOut(id=str(doc.id), name=doc.name, wilaya=doc.wilaya, delivery_fee=doc.delivery_fee, is_active=doc.is_active)


@router.delete("/places/{place_id}", dependencies=[Depends(get_current_user)])
async def delete_place(place_id: str):
    doc = await DeliveryPlaceDocument.get(place_id)
    if not doc:
        raise HTTPException(404, "Delivery place not found")
    await doc.delete()
    return {"ok": True}


# ── Delivery Agents ──────────────────────────────────────────────────────────

@router.get("/agents", response_model=list[DeliveryAgentOut])
async def list_agents(_=Depends(get_current_user)):
    docs = await DeliveryAgentDocument.find_all().to_list()
    return [DeliveryAgentOut(id=str(d.id), name=d.name, phone=d.phone, vehicle_type=d.vehicle_type, is_active=d.is_active) for d in docs]


@router.post("/agents", response_model=DeliveryAgentOut, dependencies=[Depends(get_current_user)])
async def create_agent(data: DeliveryAgentCreate):
    doc = DeliveryAgentDocument(**data.model_dump())
    await doc.insert()
    return DeliveryAgentOut(id=str(doc.id), name=doc.name, phone=doc.phone, vehicle_type=doc.vehicle_type, is_active=doc.is_active)


@router.put("/agents/{agent_id}", response_model=DeliveryAgentOut, dependencies=[Depends(get_current_user)])
async def update_agent(agent_id: str, data: DeliveryAgentUpdate):
    doc = await DeliveryAgentDocument.get(agent_id)
    if not doc:
        raise HTTPException(404, "Delivery agent not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await doc.save()
    return DeliveryAgentOut(id=str(doc.id), name=doc.name, phone=doc.phone, vehicle_type=doc.vehicle_type, is_active=doc.is_active)


@router.delete("/agents/{agent_id}", dependencies=[Depends(get_current_user)])
async def delete_agent(agent_id: str):
    doc = await DeliveryAgentDocument.get(agent_id)
    if not doc:
        raise HTTPException(404, "Delivery agent not found")
    await doc.delete()
    return {"ok": True}


# ── Assign agent to order ────────────────────────────────────────────────────

@router.post("/orders/{order_id}/assign-agent", dependencies=[Depends(get_current_user)])
async def assign_agent_to_order(order_id: str, data: AssignAgentRequest):
    order = await OrderDocument.get(order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    agent = await DeliveryAgentDocument.get(data.agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    order.delivery_agent = DeliveryAgentInfo(
        agent_id=str(agent.id),
        name=agent.name,
        phone=agent.phone,
    )
    await order.save()
    await manager.broadcast({
        "type": "order_update",
        "order_id": str(order.id),
        "order_number": order.order_number,
        "message": f"Delivery agent {agent.name} assigned to order {order.order_number}",
    })
    return {"ok": True, "agent": {"name": agent.name, "phone": agent.phone}}
