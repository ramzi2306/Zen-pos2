from typing import Optional, List, Dict
from pydantic import BaseModel, Field
from datetime import datetime

class PublicVariationOption(BaseModel):
    id: str
    name: str
    price_adjustment: float = 0

class PublicVariationGroup(BaseModel):
    id: str
    name: str
    options: List[PublicVariationOption]

class PublicProduct(BaseModel):
    id: str
    name: str
    description: str = ""
    price: float
    image: Optional[str] = None
    category: str
    in_stock: bool = True
    variations: List[PublicVariationGroup] = []

class PublicCategory(BaseModel):
    id: str
    name: str
    products: List[PublicProduct]

# --- Ordering (aligned with frontend public.ts) ---

class SelectedVariationInput(BaseModel):
    group_id: str
    option_id: str
    option_name: str
    price_adjustment: float = 0

class OnlineOrderItemInput(BaseModel):
    product_id: str
    product_name: str
    unit_price: float
    quantity: int
    notes: Optional[str] = ""
    selected_variations: List[SelectedVariationInput] = []

class OnlineCustomerInput(BaseModel):
    name: str
    phone: str
    address: str
    note: Optional[str] = ""

class OnlineOrderRequest(BaseModel):
    items: List[OnlineOrderItemInput]
    customer: OnlineCustomerInput
    location_id: Optional[str] = None

class PublicOrderResponse(BaseModel):
    id: str
    order_number: str
    tracking_token: str
    status: str
    session_token: Optional[str] = None
    estimated_delivery: Optional[datetime] = None

# --- History & Auth (Note: public.ts uses /public/auth/... prefix) ---

class OTPRequest(BaseModel):
    phone: str

class OTPVerify(BaseModel):
    phone: str
    otp: str

class PublicReviewInput(BaseModel):
    stars: int
    comment: str = ""
