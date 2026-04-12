from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class SelectedVariationSchema(BaseModel):
    group_id: str
    group_name: str
    option_id: str
    option_name: str
    price_adjustment: float = 0


class OrderItemSchema(BaseModel):
    product_id: str
    product_name: str
    category: str = ""
    unit_price: float
    quantity: int = Field(default=1, ge=1, description="Must be at least 1")
    notes: Optional[str] = None
    discount: float = 0
    selected_variations: list[SelectedVariationSchema] = []


class CustomerInfoSchema(BaseModel):
    name: str = ""
    phone: str = ""
    address: Optional[str] = None


class ReviewSchema(BaseModel):
    stars: int
    comment: str = ""


class DeliveryAgentInfoSchema(BaseModel):
    agent_id: str
    name: str
    phone: str


class OrderCreate(BaseModel):
    table: str = ""
    order_type: str = "dine_in"
    items: list[OrderItemSchema]
    customer: CustomerInfoSchema = CustomerInfoSchema()
    scheduled_time: Optional[str] = None
    notes: str = ""
    is_urgent: bool = False
    payment_status: str = "Unpaid"   # "Paid" when cashier processes payment at checkout
    payment_method: str = "Cash"     # Cash | Credit Card | Other
    status: str = "Queued"           # "Draft" for Save for Later


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    table: Optional[str] = None
    notes: Optional[str] = None
    is_urgent: Optional[bool] = None
    scheduled_time: Optional[str] = None  # set together with status="Scheduled"


class AssignCookRequest(BaseModel):
    cook_id: str


class AssignAssistantRequest(BaseModel):
    user_id: str


class OrderOut(BaseModel):
    id: str
    order_number: str
    table: str
    status: str
    payment_status: str
    payment_method: str = "Cash"
    items: list[OrderItemSchema]
    subtotal: float
    tax: float
    total: float
    order_type: str
    customer: CustomerInfoSchema
    scheduled_time: Optional[str]
    start_time: Optional[int]
    end_time: Optional[int]
    is_urgent: bool
    notes: str
    cook_id: Optional[str]
    assistant_ids: list[str]
    review: Optional[ReviewSchema]
    tracking_token: Optional[str] = None
    created_at: Optional[datetime] = None
    location_id: Optional[str] = None
    delivery_agent: Optional[DeliveryAgentInfoSchema] = None
