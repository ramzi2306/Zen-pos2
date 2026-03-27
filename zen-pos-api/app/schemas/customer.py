from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class CustomerOut(BaseModel):
    id: str
    name: str
    phone: str
    address: Optional[str] = None
    notes: str = ""
    created_at: datetime
    order_count: int = 0
    total_spent: float = 0.0
    last_order_date: Optional[datetime] = None


class CustomerOrderOut(BaseModel):
    id: str
    order_number: str
    created_at: Optional[datetime]
    total: float
    status: str
    order_type: str
    items_count: int
    review: Optional[dict] = None


class CustomerDetailOut(CustomerOut):
    orders: List[CustomerOrderOut] = []
