import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

_PRODUCT = {
    "name": "Test Tuna Roll",
    "description": "Fresh tuna",
    "price": 18.0,
    "category": "Rolls",
    "in_stock": True,
}


async def test_list_products_public(client: AsyncClient):
    """Product listing requires no auth."""
    r = await client.get("/products/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_categories_public(client: AsyncClient):
    r = await client.get("/products/categories")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_create_product_requires_auth(client: AsyncClient):
    r = await client.post("/products/", json=_PRODUCT)
    assert r.status_code == 401


async def test_create_product(client: AsyncClient, admin_token: str):
    r = await client.post(
        "/products/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=_PRODUCT,
    )
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Test Tuna Roll"
    assert d["price"] == 18.0
    assert d["in_stock"] is True
    assert "id" in d


async def test_get_product(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/products/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=_PRODUCT,
    )
    pid = create.json()["id"]
    r = await client.get(f"/products/{pid}")
    assert r.status_code == 200
    assert r.json()["id"] == pid


async def test_product_not_found(client: AsyncClient):
    r = await client.get("/products/000000000000000000000000")
    assert r.status_code == 404


async def test_update_product(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/products/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=_PRODUCT,
    )
    pid = create.json()["id"]
    r = await client.patch(
        f"/products/{pid}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"price": 22.0, "in_stock": False},
    )
    assert r.status_code == 200
    assert r.json()["price"] == 22.0
    assert r.json()["in_stock"] is False


async def test_delete_product_soft(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/products/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=_PRODUCT,
    )
    pid = create.json()["id"]
    delete = await client.delete(
        f"/products/{pid}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete.status_code == 204
    # Soft-delete: not in active list
    listing = await client.get("/products/")
    ids = [p["id"] for p in listing.json()]
    assert pid not in ids


async def test_create_category(client: AsyncClient, admin_token: str):
    r = await client.post(
        "/products/categories",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Test Category XYZ"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Test Category XYZ"
