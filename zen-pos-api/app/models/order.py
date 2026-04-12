from typing import Optional
from datetime import datetime, timezone

from beanie import Document, Link
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING, DESCENDING

from app.models.user import UserDocument
from app.models.delivery import DeliveryAgentInfo


class SelectedVariation(BaseModel):
    group_id: str
    group_name: str
    option_id: str
    option_name: str
    price_adjustment: float = 0


class OrderItem(BaseModel):
    product_id: str
    product_name: str
    category: str = ""
    unit_price: float
    quantity: int = 1
    notes: Optional[str] = None
    discount: float = 0                      # percentage, e.g. 10 = 10%
    selected_variations: list[SelectedVariation] = Field(default_factory=list)

    @property
    def line_total(self) -> float:
        variation_adj = sum(v.price_adjustment for v in self.selected_variations)
        base = (self.unit_price + variation_adj) * self.quantity
        return round(base * (1 - self.discount / 100), 2)


class CustomerInfo(BaseModel):
    name: str = ""
    phone: str = ""
    address: Optional[str] = None


class Review(BaseModel):
    stars: int
    comment: str = ""


class OrderDocument(Document):
    order_number: str                         # e.g. ORD-20240312-0042
    table: str = ""
    status: str = "Queued"
    # Queued | Scheduled | Preparing | Served | Packaging | Out for delivery | Done | Cancelled | Draft
    payment_status: str = "Unpaid"            # Unpaid | Paid
    payment_method: str = "Cash"              # Cash | Credit Card | Other
    items: list[OrderItem] = Field(default_factory=list)
    subtotal: float = 0
    tax: float = 0
    total: float = 0
    order_type: str = "dine_in"               # dine_in | takeaway | delivery
    channel: str = "staff"                    # staff | online | kiosk
    customer: CustomerInfo = Field(default_factory=CustomerInfo)

    scheduled_time: Optional[str] = None
    start_time: Optional[int] = None          # epoch ms — set when Preparing starts
    end_time: Optional[int] = None            # epoch ms — set when Preparing ends
    is_urgent: bool = False
    cook: Optional[Link[UserDocument]] = None
    assistants: list[Link[UserDocument]] = Field(default_factory=list)
    review: Optional[Review] = None
    notes: str = ""
    location_id: Optional[str] = None        # auto-set from the creating user's location
    tracking_token: Optional[str] = None      # for public order tracking; always set on new orders
    estimated_delivery: Optional[datetime] = None
    delivery_agent: Optional[DeliveryAgentInfo] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "orders"
        indexes = [
            IndexModel([("status", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("order_number", ASCENDING)], unique=True),
            IndexModel([("location_id", ASCENDING)]),
            IndexModel([("tracking_token", ASCENDING)]),
        ]
