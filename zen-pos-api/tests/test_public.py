"""
Phase 0 unit tests — public router fixes:
  0.1  reCAPTCHA: Firebase path requires recaptcha_token; no bypass token sent
  0.2  OTP: stored in MongoDB (OTPDocument), not in-memory dict
  0.3  Tax rate: read from LocalizationDocument, not hardcoded 8%
  0.4  Attendance location filter: service already filters correctly (verified)
  0.5  Session TTL: 30 days (43 200 min), not 100 years
"""
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient

from app.models.otp import OTPDocument
from app.models.customer import CustomerSessionDocument
from app.models.settings import LocalizationDocument
from app.models.product import ProductDocument, CategoryDocument
from app.models.order import OrderDocument

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── helpers ───────────────────────────────────────────────────────────────────

async def _seed_product(name="Test Burger", price=10.0, category="Burgers"):
    cat = await CategoryDocument.find_one({"name": category})
    if not cat:
        cat = CategoryDocument(name=category)
        await cat.insert()
    prod = ProductDocument(name=name, price=price, category=category, is_active=True)
    await prod.insert()
    return prod


async def _set_tax_rate(rate: float, enabled: bool = True):
    doc = await LocalizationDocument.find_one({"key": "localization"})
    if doc:
        doc.tax_rate = rate
        doc.tax_enabled = enabled
        await doc.save()
    else:
        await LocalizationDocument(key="localization", tax_rate=rate, tax_enabled=enabled).insert()


_SAMPLE_ORDER = {
    "items": [
        {
            "product_id": "",          # filled per-test
            "product_name": "Test Burger",
            "unit_price": 10.0,
            "quantity": 2,
            "selected_variations": [],
        }
    ],
    "customer": {
        "name": "Alice",
        "phone": "+213555000001",
        "address": "1 rue de la Paix",
        "note": "",
    },
}


# ── Phase 0.1 — reCAPTCHA / OTP request ──────────────────────────────────────

async def test_otp_request_no_firebase_returns_otp_in_body(client: AsyncClient):
    """When Firebase is disabled the endpoint returns the OTP in the response (dev mode)."""
    resp = await client.post("/public/auth/request-otp", json={"phone": "+213500000001"})
    assert resp.status_code == 200
    body = resp.json()
    assert "otp" in body, "Dev mode should return OTP in body when no Firebase config"
    assert len(body["otp"]) == 6


async def test_otp_request_firebase_requires_recaptcha_token(client: AsyncClient):
    """When Firebase is enabled and recaptcha_token is absent, return 400."""
    from app.models.settings import IntegrationDocument
    doc = await IntegrationDocument.find_one({"key": "integration"})
    if not doc:
        doc = IntegrationDocument(
            key="integration",
            firebase_enabled=True,
            firebase_api_key="fake-key",
        )
        await doc.insert()
    else:
        doc.firebase_enabled = True
        doc.firebase_api_key = "fake-key"
        await doc.save()

    resp = await client.post("/public/auth/request-otp", json={"phone": "+213500000002"})
    assert resp.status_code == 400
    assert "recaptcha_token" in resp.json()["detail"].lower()

    # Restore
    doc.firebase_enabled = False
    doc.firebase_api_key = ""
    await doc.save()


# ── Phase 0.2 — OTP persisted in MongoDB ─────────────────────────────────────

async def test_otp_stored_in_mongodb_not_memory(client: AsyncClient):
    """After requesting an OTP, an OTPDocument must exist in the DB."""
    phone = "+213500000010"
    await OTPDocument.find({"phone": phone}).delete()

    resp = await client.post("/public/auth/request-otp", json={"phone": phone})
    assert resp.status_code == 200

    doc = await OTPDocument.find_one({"phone": phone})
    assert doc is not None, "OTPDocument should be persisted in MongoDB"
    assert len(doc.otp) == 6
    assert doc.expires_at > datetime.now(timezone.utc)


async def test_otp_verify_success_cleans_up_document(client: AsyncClient):
    """Verifying a correct OTP deletes the OTPDocument."""
    phone = "+213500000011"
    await OTPDocument.find({"phone": phone}).delete()

    req_resp = await client.post("/public/auth/request-otp", json={"phone": phone})
    otp_value = req_resp.json()["otp"]

    verify_resp = await client.post("/public/auth/verify-otp", json={"phone": phone, "otp": otp_value})
    assert verify_resp.status_code == 200
    assert "sessionToken" in verify_resp.json()

    remaining = await OTPDocument.find_one({"phone": phone})
    assert remaining is None, "OTPDocument must be deleted after successful verification"


async def test_otp_verify_wrong_otp_rejected(client: AsyncClient):
    phone = "+213500000012"
    await OTPDocument.find({"phone": phone}).delete()
    await client.post("/public/auth/request-otp", json={"phone": phone})

    resp = await client.post("/public/auth/verify-otp", json={"phone": phone, "otp": "000000"})
    assert resp.status_code == 400


async def test_otp_verify_expired_otp_rejected(client: AsyncClient):
    """Manually insert an already-expired OTP and verify it's rejected."""
    phone = "+213500000013"
    await OTPDocument.find({"phone": phone}).delete()
    await OTPDocument(
        phone=phone,
        otp="123456",
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    ).insert()

    resp = await client.post("/public/auth/verify-otp", json={"phone": phone, "otp": "123456"})
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


# ── Phase 0.3 — Tax rate from LocalizationDocument ───────────────────────────

async def test_online_order_uses_localization_tax_rate(client: AsyncClient):
    """Order total must use the tax rate stored in LocalizationDocument, not 0.08."""
    product = await _seed_product(name="Tax Test Burger", price=100.0)

    await _set_tax_rate(10.0)   # 10% — different from old hardcoded 8%

    order_payload = {
        "items": [{
            "product_id": str(product.id),
            "product_name": "Tax Test Burger",
            "unit_price": 100.0,
            "quantity": 1,
            "selected_variations": [],
        }],
        "customer": {"name": "Bob", "phone": "+213555000002", "address": "2 rue test", "note": ""},
    }

    resp = await client.post("/public/orders", json=order_payload)
    assert resp.status_code == 200

    order_id = resp.json()["id"]
    order = await OrderDocument.get(order_id)
    assert order is not None
    # subtotal=100, tax@10%=10, total=110
    assert order.tax == pytest.approx(10.0, abs=0.01)
    assert order.total == pytest.approx(110.0, abs=0.01)


async def test_online_order_tax_disabled_yields_zero_tax(client: AsyncClient):
    product = await _seed_product(name="No Tax Burger", price=50.0)
    await _set_tax_rate(8.0, enabled=False)

    resp = await client.post("/public/orders", json={
        "items": [{
            "product_id": str(product.id),
            "product_name": "No Tax Burger",
            "unit_price": 50.0,
            "quantity": 1,
            "selected_variations": [],
        }],
        "customer": {"name": "Carol", "phone": "+213555000003", "address": "3 rue test", "note": ""},
    })
    assert resp.status_code == 200
    order = await OrderDocument.get(resp.json()["id"])
    assert order.tax == 0.0
    assert order.total == pytest.approx(50.0, abs=0.01)

    # Restore
    await _set_tax_rate(8.0, enabled=True)


# ── Phase 0.4 — Attendance location filter (already working — regression test) ─

async def test_attendance_service_filters_by_location():
    """get_today_records filters by location_id when provided."""
    from app.services.attendance_service import get_today_records
    from app.models.attendance import AttendanceRecordDocument
    from app.models.user import UserDocument, RoleDocument

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    role = await RoleDocument.find_one({"name": "Test Admin"})

    user_a = UserDocument(
        name="Loc Test A", email="loca@zenpos.com",
        hashed_password="x", phone="", role=role, location_id="loc-A",
    )
    user_b = UserDocument(
        name="Loc Test B", email="locb@zenpos.com",
        hashed_password="x", phone="", role=role, location_id="loc-B",
    )
    await user_a.insert()
    await user_b.insert()

    rec_a = AttendanceRecordDocument(user=user_a, date=today, status="active", location_id="loc-A")
    rec_b = AttendanceRecordDocument(user=user_b, date=today, status="active", location_id="loc-B")
    await rec_a.insert()
    await rec_b.insert()

    records_a = await get_today_records(location_id="loc-A")
    ids_a = {str(r.id) for r in records_a}
    assert str(rec_a.id) in ids_a
    assert str(rec_b.id) not in ids_a

    all_records = await get_today_records(location_id=None)
    all_ids = {str(r.id) for r in all_records}
    assert str(rec_a.id) in all_ids
    assert str(rec_b.id) in all_ids

    # Cleanup
    await rec_a.delete()
    await rec_b.delete()
    await user_a.delete()
    await user_b.delete()


# ── Phase 0.5 — Session TTL = 30 days ────────────────────────────────────────

async def test_session_ttl_is_30_days(client: AsyncClient):
    """Sessions created by verify-otp must expire in ~30 days, not 100 years."""
    phone = "+213500000020"
    await OTPDocument.find({"phone": phone}).delete()
    await CustomerSessionDocument.find({"phone": phone}).delete()

    req_resp = await client.post("/public/auth/request-otp", json={"phone": phone})
    otp_value = req_resp.json()["otp"]

    verify_resp = await client.post("/public/auth/verify-otp", json={"phone": phone, "otp": otp_value})
    assert verify_resp.status_code == 200

    session_token = verify_resp.json()["sessionToken"]
    session = await CustomerSessionDocument.find_one({"token": session_token})
    assert session is not None

    now = datetime.now(timezone.utc)
    delta_days = (session.expires_at - now).days
    # Should be ~30 days (allow 1-day tolerance)
    assert 29 <= delta_days <= 31, f"Expected ~30 days TTL, got {delta_days} days"


async def test_login_no_otp_session_ttl_is_30_days(client: AsyncClient):
    """Sessions from login-no-otp also use 30-day TTL."""
    phone = "+213500000021"
    await CustomerSessionDocument.find({"phone": phone}).delete()

    resp = await client.post("/public/auth/login-no-otp", json={"phone": phone})
    assert resp.status_code == 200

    token = resp.json()["sessionToken"]
    session = await CustomerSessionDocument.find_one({"token": token})
    assert session is not None

    delta_days = (session.expires_at - datetime.now(timezone.utc)).days
    assert 29 <= delta_days <= 31
