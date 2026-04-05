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
    supplements: List[PublicVariationGroup] = [] # Reusing PublicVariationGroup for supplements too

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

from pydantic import BaseModel, ConfigDict

class PublicReviewInput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    stars: int
    comment: str = ""

class PublicOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    order_number: str
    tracking_token: str
    status: str
    session_token: Optional[str] = None
    estimated_delivery: Optional[datetime] = None
    review: Optional[PublicReviewInput] = None

# --- History & Auth (Note: public.ts uses /public/auth/... prefix) ---

class OTPRequest(BaseModel):
    phone: str
    recaptcha_token: Optional[str] = None  # Required for Firebase SMS; if absent, Firebase path is skipped

class OTPVerify(BaseModel):
    phone: str
    otp: str
