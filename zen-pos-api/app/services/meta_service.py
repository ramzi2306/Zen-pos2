import httpx
import logging
import time
import hashlib
from typing import Optional
from app.models.settings import IntegrationDocument

async def send_meta_capi_event(
    event_name: str,
    event_id: str,
    user_data: dict,
    custom_data: Optional[dict] = None
):
    """
    Sends a server-side event to Meta Conversions API (CAPI).
    """
    integration = await IntegrationDocument.find_one({"key": "integration"})
    if not integration or not integration.meta_capi_enabled or not integration.meta_capi_token or not integration.meta_pixel_id:
        return

    # Prepare user data (Meta recommends hashing PI where possible, but for simplicity we'll send it and let Meta handle it or hash it here)
    # Meta CAPI requires at least one of client_ip_address, client_user_agent, or several other pieces of info.
    # We'll normalize what we have.
    
    hashed_user_data = {}
    if "phone" in user_data and user_data["phone"]:
        phone = "".join(filter(str.isdigit, user_data["phone"]))
        hashed_user_data["ph"] = [hashlib.sha256(phone.encode()).hexdigest()]
    if "name" in user_data and user_data["name"]:
        name = user_data["name"].lower().strip()
        hashed_user_data["fn"] = [hashlib.sha256(name.encode()).hexdigest()]

    # Add extra raw data if provided (like IP/UA)
    for key in ["client_ip_address", "client_user_agent", "external_id"]:
        if key in user_data:
            hashed_user_data[key] = user_data[key]

    payload = {
        "data": [
            {
                "event_name": event_name,
                "event_time": int(time.time()),
                "action_source": "website",
                "event_id": event_id,
                "user_data": hashed_user_data,
                "custom_data": custom_data or {}
            }
        ]
    }

    if integration.meta_capi_test_event_code:
        payload["test_event_code"] = integration.meta_capi_test_event_code

    url = f"https://graph.facebook.com/v18.0/{integration.meta_pixel_id}/events?access_token={integration.meta_capi_token}"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            if resp.status_code != 200:
                logging.error(f"Meta CAPI Error: {resp.text}")
            else:
                logging.info(f"Meta CAPI Success: {event_name}")
    except Exception as exc:
        logging.error(f"Meta CAPI Exception: {exc}")

async def track_order_purchase(order_doc, customer_phone: str, customer_name: str):
    """
    Helper to track order purchase via CAPI.
    """
    user_data = {
        "phone": customer_phone,
        "name": customer_name,
        "external_id": str(order_doc.id)
    }
    
    custom_data = {
        "value": float(order_doc.total),
        "currency": "DZD",
        "content_ids": [str(item.product_id) for item in order_doc.items],
        "content_type": "product",
        "num_items": sum(item.quantity for item in order_doc.items)
    }

    await send_meta_capi_event(
        event_name="Purchase",
        event_id=order_doc.tracking_token, # Using tracking_token for deduplication with browser pixel
        user_data=user_data,
        custom_data=custom_data
    )
