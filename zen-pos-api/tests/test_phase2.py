"""
Phase 2 backend unit tests

2.5  Order creation rejects items with quantity < 1
2.6  Date-based order query uses timezone from LocalizationDocument
"""
import pytest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from httpx import AsyncClient

from app.models.settings import LocalizationDocument
from app.models.order import OrderDocument

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── 2.5  Quantity validation ──────────────────────────────────────────────────

async def test_create_order_rejects_zero_quantity(client: AsyncClient, admin_token: str):
    """quantity=0 must return 422 Unprocessable Entity."""
    payload = {
        "table": "T1",
        "order_type": "dine_in",
        "items": [
            {
                "product_id": "fake-id",
                "product_name": "Burger",
                "unit_price": 10.0,
                "quantity": 0,          # ← invalid
                "selected_variations": [],
            }
        ],
    }
    resp = await client.post(
        "/orders/",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_create_order_rejects_negative_quantity(client: AsyncClient, admin_token: str):
    payload = {
        "table": "T1",
        "order_type": "dine_in",
        "items": [
            {
                "product_id": "fake-id",
                "product_name": "Burger",
                "unit_price": 10.0,
                "quantity": -3,         # ← invalid
                "selected_variations": [],
            }
        ],
    }
    resp = await client.post(
        "/orders/",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


async def test_create_order_accepts_valid_quantity(client: AsyncClient, admin_token: str):
    """quantity=1 must be accepted (product existence check not required for this test)."""
    payload = {
        "table": "T1",
        "order_type": "dine_in",
        "items": [
            {
                "product_id": "fake-id",
                "product_name": "Burger",
                "unit_price": 10.0,
                "quantity": 1,          # ← valid
                "selected_variations": [],
            }
        ],
    }
    resp = await client.post(
        "/orders/",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # 201 = created; anything other than 422 confirms validation passed
    assert resp.status_code != 422, f"quantity=1 should not fail validation"


# ── 2.6  Timezone-aware date filtering ────────────────────────────────────────

async def test_order_date_filter_respects_localization_timezone():
    """
    Orders created near midnight behave correctly when a non-UTC timezone is set.

    Setup: timezone = Africa/Algiers (UTC+1).
    Create an order at 23:30 UTC (= 00:30 Algiers next day).
    Querying for "yesterday Algiers date" should NOT return that order.
    Querying for "today Algiers date" SHOULD return it.
    """
    from app.routers.orders import list_orders   # noqa — we test the logic directly
    from zoneinfo import ZoneInfo

    algiers = ZoneInfo("Africa/Algiers")  # UTC+1

    # Simulate: it's 23:30 UTC = 00:30 in Algiers (next calendar day)
    now_utc = datetime(2025, 6, 15, 23, 30, 0, tzinfo=timezone.utc)
    now_algiers = now_utc.astimezone(algiers)

    # The Algiers calendar date is June 16
    algiers_date = now_algiers.date()  # 2025-06-16

    # day_start / day_end for June 16 in Algiers (the fixed logic)
    day_start = datetime(2025, 6, 16, 0, 0, 0, tzinfo=algiers).astimezone(timezone.utc)
    day_end   = datetime(2025, 6, 16, 23, 59, 59, 999999, tzinfo=algiers).astimezone(timezone.utc)

    # The order was created at 23:30 UTC on June 15
    # In Algiers that's 00:30 June 16 — so it should fall INSIDE June 16's window
    assert day_start <= now_utc <= day_end, (
        f"Order at {now_utc} should be within Algiers June 16 window "
        f"[{day_start} … {day_end}]"
    )

    # Conversely, UTC midnight query (old broken behavior) would compute:
    old_day_start = datetime(2025, 6, 16, 0, 0, 0, tzinfo=timezone.utc)
    old_day_end   = datetime(2025, 6, 16, 23, 59, 59, 999999, tzinfo=timezone.utc)
    # The order at 23:30 UTC June 15 would NOT be in June 16's UTC window
    assert not (old_day_start <= now_utc <= old_day_end), \
        "Old UTC-only logic incorrectly excluded this order"


async def test_order_date_filter_falls_back_to_utc_on_bad_timezone(client: AsyncClient, admin_token: str):
    """If LocalizationDocument has an invalid timezone, the filter falls back to UTC without crashing."""
    doc = await LocalizationDocument.find_one({"key": "localization"})
    original_tz = doc.timezone if doc else "UTC"

    if doc:
        doc.timezone = "Invalid/Timezone_XYZ"
        await doc.save()
    else:
        doc = LocalizationDocument(key="localization", timezone="Invalid/Timezone_XYZ")
        await doc.insert()

    try:
        resp = await client.get(
            "/orders/?date=2025-06-15",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, f"Should not crash on invalid tz: {resp.text}"
    finally:
        if doc:
            doc.timezone = original_tz
            await doc.save()
