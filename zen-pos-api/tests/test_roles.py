import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_list_roles_public(client: AsyncClient):
    """Role listing is public."""
    r = await client.get("/roles/")
    assert r.status_code == 200
    roles = r.json()
    assert isinstance(roles, list)
    names = [ro["name"] for ro in roles]
    assert "Test Admin" in names


async def test_create_role_requires_auth(client: AsyncClient):
    r = await client.post("/roles/", json={"name": "Anon Role", "permissions": []})
    assert r.status_code == 401


async def test_create_role(client: AsyncClient, admin_token: str):
    r = await client.post(
        "/roles/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Test Cashier", "permissions": ["view_menu", "view_orders"]},
    )
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Test Cashier"
    assert "view_menu" in d["permissions"]
    assert "id" in d


async def test_create_role_duplicate(client: AsyncClient, admin_token: str):
    await client.post(
        "/roles/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Unique Role", "permissions": []},
    )
    r = await client.post(
        "/roles/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Unique Role", "permissions": []},
    )
    assert r.status_code == 409


async def test_update_role(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/roles/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Role To Update", "permissions": ["view_menu"]},
    )
    role_id = create.json()["id"]
    r = await client.patch(
        f"/roles/{role_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"permissions": ["view_menu", "view_orders", "view_staff"]},
    )
    assert r.status_code == 200
    assert "view_staff" in r.json()["permissions"]


async def test_update_role_not_found(client: AsyncClient, admin_token: str):
    r = await client.patch(
        "/roles/000000000000000000000000",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Ghost"},
    )
    assert r.status_code == 404


async def test_delete_role(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/roles/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Role To Delete", "permissions": []},
    )
    role_id = create.json()["id"]
    r = await client.delete(
        f"/roles/{role_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 204
    # Should no longer appear in list
    listing = await client.get("/roles/")
    ids = [ro["id"] for ro in listing.json()]
    assert role_id not in ids
