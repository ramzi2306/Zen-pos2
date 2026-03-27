import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


_ITEM = {
    "product_id": "test-product-1",
    "product_name": "Test Nigiri",
    "unit_price": 18.0,
    "quantity": 2,
    "selected_variations": [],
}


# ── helpers ────────────────────────────────────────────────────────────────────

async def _create(client, token, **kwargs):
    payload = {"table": "T1", "order_type": "dine_in", "items": [_ITEM]}
    payload.update(kwargs)
    return await client.post(
        "/orders/",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )


# ── tests ──────────────────────────────────────────────────────────────────────

async def test_create_order(client: AsyncClient, admin_token: str):
    r = await _create(client, admin_token, customer={"name": "Alice", "phone": "555-0001"})
    assert r.status_code == 201
    d = r.json()
    assert d["status"] == "Queued"
    assert d["payment_status"] == "Unpaid"
    assert d["total"] > 0
    assert d["order_number"].startswith("#")
    assert d["items"][0]["product_name"] == "Test Nigiri"


async def test_create_draft_order(client: AsyncClient, admin_token: str):
    r = await _create(client, admin_token, status="Draft", table="TD")
    assert r.status_code == 201
    assert r.json()["status"] == "Draft"


async def test_create_urgent_order(client: AsyncClient, admin_token: str):
    r = await _create(client, admin_token, is_urgent=True)
    assert r.status_code == 201
    assert r.json()["is_urgent"] is True


async def test_list_orders(client: AsyncClient, admin_token: str):
    r = await client.get("/orders/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_get_order_by_id(client: AsyncClient, admin_token: str):
    create = await _create(client, admin_token)
    order_id = create.json()["id"]
    r = await client.get(f"/orders/{order_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["id"] == order_id


async def test_order_not_found(client: AsyncClient, admin_token: str):
    r = await client.get(
        "/orders/000000000000000000000000",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_requires_auth(client: AsyncClient):
    r = await client.get("/orders/")
    assert r.status_code == 401


async def test_requires_cook_before_preparing(client: AsyncClient, admin_token: str):
    """Transitioning to Preparing without an assigned cook must return 400."""
    create = await _create(client, admin_token, table="TC1")
    order_id = create.json()["id"]

    r = await client.patch(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "Preparing"},
    )
    assert r.status_code == 400


async def test_full_order_lifecycle(client: AsyncClient, admin_token: str, cook_user_id: str):
    """Queued → assign cook → Preparing → Served → Done."""
    create = await _create(client, admin_token, table="TL1")
    assert create.status_code == 201
    order_id = create.json()["id"]

    # Assign cook
    assign = await client.post(
        f"/orders/{order_id}/assign-cook",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"cook_id": cook_user_id},
    )
    assert assign.status_code == 200
    assert assign.json()["cook_id"] == cook_user_id

    # → Preparing
    prep = await client.patch(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "Preparing"},
    )
    assert prep.status_code == 200
    assert prep.json()["status"] == "Preparing"
    assert prep.json()["start_time"] is not None

    # → Served
    served = await client.patch(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "Served"},
    )
    assert served.status_code == 200

    # → Done
    done = await client.patch(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "Done"},
    )
    assert done.status_code == 200
    assert done.json()["status"] == "Done"
    assert done.json()["end_time"] is not None


async def test_invalid_status_transition(client: AsyncClient, admin_token: str):
    """Queued → Done is not a valid transition."""
    create = await _create(client, admin_token, table="TI1")
    order_id = create.json()["id"]

    r = await client.patch(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "Done"},
    )
    assert r.status_code == 400


async def test_update_payment_status(client: AsyncClient, admin_token: str):
    create = await _create(client, admin_token, table="TP1")
    order_id = create.json()["id"]

    r = await client.patch(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"payment_status": "Paid"},
    )
    assert r.status_code == 200
    assert r.json()["payment_status"] == "Paid"


async def test_cancel_order(client: AsyncClient, admin_token: str):
    create = await _create(client, admin_token, table="TX1")
    order_id = create.json()["id"]

    delete = await client.delete(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete.status_code == 204

    # Status is now Cancelled, not gone from DB
    get = await client.get(
        f"/orders/{order_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert get.json()["status"] == "Cancelled"


async def test_tax_calculation(client: AsyncClient, admin_token: str):
    """Tax should be ~8.875% of subtotal."""
    r = await _create(client, admin_token, table="TTX",
                      items=[{"product_id": "p", "product_name": "Roll",
                               "unit_price": 100.0, "quantity": 1,
                               "selected_variations": []}])
    assert r.status_code == 201
    d = r.json()
    assert d["subtotal"] == 100.0
    assert abs(d["tax"] - 8.875) < 0.01
    assert abs(d["total"] - 108.875) < 0.01
