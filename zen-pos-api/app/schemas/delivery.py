from typing import Optional
from pydantic import BaseModel


# ── Delivery Places ──────────────────────────────────────────────────────────

class DeliveryPlaceCreate(BaseModel):
    name: str
    wilaya: str = ""
    delivery_fee: float = 0
    is_active: bool = True


class DeliveryPlaceUpdate(BaseModel):
    name: Optional[str] = None
    wilaya: Optional[str] = None
    delivery_fee: Optional[float] = None
    is_active: Optional[bool] = None


class DeliveryPlaceOut(BaseModel):
    id: str
    name: str
    wilaya: str
    delivery_fee: float
    is_active: bool


# ── Delivery Agents ──────────────────────────────────────────────────────────

class DeliveryAgentCreate(BaseModel):
    name: str
    phone: str
    vehicle_type: str = ""
    is_active: bool = True


class DeliveryAgentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_active: Optional[bool] = None


class DeliveryAgentOut(BaseModel):
    id: str
    name: str
    phone: str
    vehicle_type: str
    is_active: bool


# ── Assign agent to order ────────────────────────────────────────────────────

class AssignAgentRequest(BaseModel):
    agent_id: str
