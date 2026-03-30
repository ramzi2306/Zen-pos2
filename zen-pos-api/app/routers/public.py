from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Header, WebSocket, WebSocketDisconnect
from typing import List, Optional
import uuid
import secrets
import random
import httpx
from datetime import datetime, timezone, timedelta

from app.models.product import ProductDocument, CategoryDocument
from app.models.order import OrderDocument, OrderItem, SelectedVariation, CustomerInfo, Review
from app.models.customer import CustomerDocument, CustomerSessionDocument
from app.models.settings import IntegrationDocument
from app.schemas.public import (
    PublicCategory, PublicProduct, PublicVariationGroup, PublicVariationOption,
    OnlineOrderRequest, PublicOrderResponse, OTPRequest, OTPVerify, PublicReviewInput
)
from app.routers.ws import manager

router = APIRouter()

# Simple In-memory store for short-lived OTPs (5-min TTL, no need for DB persistence)
OTP_STORE = {}


async def _create_session(phone: str, ttl_minutes: int) -> tuple[str, datetime]:
    """Insert a new customer session into MongoDB and return (token, expires_at)."""
    session_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    await CustomerSessionDocument(token=session_token, phone=phone, expires_at=expires_at).insert()
    return session_token, expires_at


async def _get_session(token: str) -> CustomerSessionDocument | None:
    """Look up a session by token, delete and return None if expired."""
    if not token:
        return None
    doc = await CustomerSessionDocument.find_one({"token": token})
    if not doc:
        return None
    if doc.expires_at < datetime.now(timezone.utc):
        await doc.delete()
        return None
    return doc

@router.get("/menu", response_model=List[PublicCategory])
async def get_public_menu():
    categories = await CategoryDocument.find_all().to_list()
    products = await ProductDocument.find({"is_active": True}).to_list()
    
    result = []
    for cat in categories:
        cat_products = [p for p in products if p.category == cat.name]
        if not cat_products:
            continue
            
        public_products = [
            PublicProduct(
                id=str(p.id),
                name=p.name,
                description=p.description if p.description else "",
                price=p.price,
                image=p.image if p.image else None,
                category=p.category,
                in_stock=p.in_stock,
                variations=[
                    PublicVariationGroup(
                        id=vg.id,
                        name=vg.name,
                        options=[
                            PublicVariationOption(
                                id=vo.id,
                                name=vo.name,
                                price_adjustment=vo.price_adjustment if vo.price_adjustment else 0
                            ) for vo in vg.options
                        ]
                    ) for vg in p.variations
                ]
            ) for p in cat_products
        ]
        
        result.append(PublicCategory(
            id=str(cat.id),
            name=cat.name,
            products=public_products
        ))
    
    return result

@router.post("/orders", response_model=PublicOrderResponse)
async def create_public_order(req: OnlineOrderRequest, background_tasks: BackgroundTasks):
    # 1. Generate a unique order number using global online-order count to avoid
    #    date-reset collisions (e.g. ONL-0001 already existing from a previous day).
    count = await OrderDocument.find({"channel": "online"}).count()
    order_number = f"ONL-{count+1:04d}"
    # Ensure uniqueness in case of concurrent inserts or existing records
    while await OrderDocument.find_one({"order_number": order_number}):
        count += 1
        order_number = f"ONL-{count+1:04d}"
    
    # 2. Convert items
    order_items = []
    subtotal = 0
    for item in req.items:
        product = await ProductDocument.get(item.product_id)
        # We process it even if the specific product query fails, as long as input data is there
        
        variations = []
        variation_adj = 0
        for v_input in item.selected_variations:
            variation_adj += v_input.price_adjustment
            variations.append(SelectedVariation(
                group_id=v_input.group_id,
                group_name=v_input.group_id, # Fallback name
                option_id=v_input.option_id,
                option_name=v_input.option_name,
                price_adjustment=v_input.price_adjustment
            ))
        
        item_total = (item.unit_price + variation_adj) * item.quantity
        subtotal += item_total
        
        order_items.append(OrderItem(
            product_id=item.product_id,
            product_name=item.product_name,
            unit_price=item.unit_price,
            quantity=item.quantity,
            notes=item.notes if item.notes else None,
            selected_variations=variations,
            category=product.category if product else ""
        ))
        
    tax = round(subtotal * 0.08, 2)
    total = subtotal + tax
    tracking_token = str(uuid.uuid4())
    
    # 3. Create document
    order = OrderDocument(
        order_number=order_number,
        status="Verification",
        payment_status="Unpaid",
        items=order_items,
        subtotal=round(subtotal, 2),
        tax=tax,
        total=round(total, 2),
        order_type="delivery",
        channel="online",
        customer=CustomerInfo(

            name=req.customer.name,
            phone=req.customer.phone,
            address=req.customer.address
        ),
        notes=req.customer.note if req.customer.note else "",
        location_id=req.location_id,
        tracking_token=tracking_token,
        created_at=datetime.now(timezone.utc)
    )
    
    await order.insert()
    
    # 3.5. Also Upsert CustomerDocument to keep the global customer list fresh
    customer_doc = await CustomerDocument.find_one({"phone": req.customer.phone})
    if customer_doc:
        # Avoid overwriting a manual change from dashboard unless it's new
        if not customer_doc.address or req.customer.address:
            customer_doc.address = req.customer.address
        customer_doc.name = req.customer.name
        await customer_doc.save()
    else:
        await CustomerDocument(
            name=req.customer.name,
            phone=req.customer.phone,
            address=req.customer.address
        ).insert()
    
    # 4. Notify POS via WebSocket
    background_tasks.add_task(
        manager.broadcast, 
        "new_order",
        {
            "order_id": str(order.id), 
            "order_number": order_number,
            "source": "online"
        }
    )
    
    # 5. Automatically create a session for the customer so history is "logged in"
    session_token, _ = await _create_session(req.customer.phone, ttl_minutes=60)

    return PublicOrderResponse(
        id=str(order.id),
        order_number=order_number,
        tracking_token=tracking_token,
        status=order.status,
        session_token=session_token
    )

@router.get("/orders/track/{token}")
async def track_public_order(token: str):
    order = await OrderDocument.find_one({"tracking_token": token})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "tracking_token": order.tracking_token,
        "status": order.status,
        "estimated_delivery": order.estimated_delivery,
        "review": order.review.model_dump() if order.review else None,
    }

@router.post("/orders/confirm-delivery/{token}")
async def confirm_delivery(token: str):
    order = await OrderDocument.find_one({"tracking_token": token})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order.status = "Done"
    await order.save()
    
    # Notify staff too if needed (optional)
    await manager.broadcast("order_update", {"order_id": str(order.id), "status": "Done"})
    
    return {"message": "Order delivered"}

# --- OTP Authentication (Mounted at /public/auth) ---

@router.post("/auth/request-otp")
async def request_otp(req: OTPRequest):
    # 1. Fetch integration settings
    integration = await IntegrationDocument.find_one({"key": "integration"})
    
    otp = f"{random.randint(100000, 999999)}"
    OTP_STORE[req.phone] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=5)
    }
    
    # 2. Check for Firebase SMS
    if integration and integration.firebase_enabled and integration.firebase_api_key:
        try:
            # Note: For Firebase SMS, Identity Platform usually requires a reCAPTCHA token from the frontend.
            # However, for certain regions or with custom service accounts, we call the Toolkit REST API.
            # Here we implement the standard "SendVerificationCode" flow which most users expect.
            url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key={integration.firebase_api_key}"
            payload = {
                "phoneNumber": req.phone,
                "recaptchaToken": "manual_bypass" # Note: Production would require frontend-generated token
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, timeout=10.0)
                # If Firebase rejected it (likely reCAPTCHA missing), we fall back to debug to keep the app working
                if resp.status_code != 200:
                    print(f"FIREBASE SMS FAIL (reCAPTCHA needed?): {resp.text}")
                    print(f"DEBUG FALLBACK: OTP for {req.phone} is {otp}")
                    return {"message": "OTP sent via debug fallback (check console). Please configure reCAPTCHA for production SMS."}

                firebase_data = resp.json()
                OTP_STORE[req.phone]["session_info"] = firebase_data.get("sessionInfo")
                return {"message": "Verification code sent via SMS"}
        except Exception as e:
            print(f"FIREBASE SMS ERROR: {str(e)}")
            print(f"DEBUG FALLBACK: OTP for {req.phone} is {otp}")
            return {"message": "OTP sent via debug fallback due to error."}

    # 3. Default Debug Fallback
    print(f"DEBUG: OTP for {req.phone} is {otp}")
    return {"message": "OTP sent successfully (debug: see console)"}

@router.post("/auth/verify-otp")
async def verify_otp(req: OTPVerify):
    data = OTP_STORE.get(req.phone)
    if not data or data["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    if data["expires"] < datetime.now(timezone.utc):
        del OTP_STORE[req.phone]
        raise HTTPException(status_code=400, detail="OTP expired")
        
    # Generate session token
    session_token, expires_at = await _create_session(req.phone, ttl_minutes=30)

    # Clean up OTP
    del OTP_STORE[req.phone]

    return {
        "sessionToken": session_token,
        "expiresAt": expires_at.isoformat()
    }

@router.post("/auth/login-no-otp")
async def login_no_otp(req: OTPRequest):
    # 1. Fetch integration settings to verify bypass is allowed
    integration = await IntegrationDocument.find_one({"key": "integration"})
    if integration and integration.firebase_enabled:
        raise HTTPException(status_code=403, detail="SMS Authentication is required.")
        
    # Generate session token immediately
    session_token, expires_at = await _create_session(req.phone, ttl_minutes=60)

    return {
        "sessionToken": session_token,
        "expiresAt": expires_at.isoformat()
    }

@router.get("/orders/history")
async def get_customer_history(x_customer_session: str = Header(None)):
    session = await _get_session(x_customer_session)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    phone = session.phone
    orders = await OrderDocument.find({"customer.phone": phone}).sort("-created_at").to_list()
    
    result = []
    for o in orders:
        result.append({
            "id": str(o.id),
            "orderNumber": o.order_number,
            "createdAt": o.created_at,
            "total": o.total,
            "status": o.status,
            "trackingToken": o.tracking_token,
            "items": [
                {"name": i.product_name, "quantity": i.quantity} for i in o.items
            ],
            "review": o.review.model_dump() if o.review else None
        })
    
    return result

@router.post("/orders/{order_id}/review")
async def post_review(order_id: str, review: PublicReviewInput, x_customer_session: str = Header(None)):
    # Optional: verify session before allowing review
    # if not x_customer_session or x_customer_session not in CUSTOMER_SESSIONS:
    #     raise HTTPException(status_code=401, detail="Invalid session")

    order = await OrderDocument.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    order.review = Review(
        stars=review.stars,
        comment=review.comment
    )
    await order.save()
    return {"message": "Review submitted"}

@router.get("/customers/lookup")
async def lookup_public_customer(phone: str):
    ised_phone = "".join(filter(str.isdigit, phone))
    # We should normalize phone in DB too, but for now we look for exact or partial
    # In a real app we'd have a canonical format
    customer = await CustomerDocument.find_one({"phone": phone})
    if not customer:
        # Fallback for simplified lookup (often phones are stored without formatting)
        customers = await CustomerDocument.find_all().to_list()
        customer = next((c for c in customers if "".join(filter(str.isdigit, c.phone)) == ised_phone), None)
        
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    return {
        "id": str(customer.id),
        "name": customer.name,
        "address": customer.address
    }

@router.patch("/customers/{customer_id}")
async def update_public_customer_profile(customer_id: str, data: dict, x_customer_session: str = Header(None)):
    session = await _get_session(x_customer_session)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    # Verify session matches the customer being changed (security)
    customer = await CustomerDocument.get(customer_id)
    if not customer or customer.phone != session.phone:
         raise HTTPException(status_code=403, detail="Forbidden")

    if "name" in data:
        customer.name = data["name"]
    if "address" in data:
        customer.address = data["address"]
        
    await customer.save()
    return {"message": "Profile updated"}


@router.websocket("/ws/track/{token}")
async def ws_track(websocket: WebSocket, token: str):
    order = await OrderDocument.find_one(OrderDocument.tracking_token == token)
    if not order:
        await websocket.close(code=4004)
        return
    
    topic = f"track_{token}"
    await manager.connect(websocket, topic=topic)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket, topic=topic)
