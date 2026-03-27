import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_list_users_public(client: AsyncClient):
    """User listing is public (kiosk tablet needs it without auth)."""
    r = await client.get("/users/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    # Seeded admin should appear
    names = [u["name"] for u in r.json()]
    assert "Test Admin" in names


async def test_get_user_requires_auth(client: AsyncClient, admin_user_id: str):
    r = await client.get(f"/users/{admin_user_id}")
    assert r.status_code == 401


async def test_get_user(client: AsyncClient, admin_token: str, admin_user_id: str):
    r = await client.get(
        f"/users/{admin_user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == admin_user_id
    assert d["email"] == "testadmin@zenpos.com"
    assert "permissions" in d


async def test_get_user_not_found(client: AsyncClient, admin_token: str):
    r = await client.get(
        "/users/000000000000000000000000",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_create_user(client: AsyncClient, admin_token: str, seeded_users):
    """Create a new staff user; role_id taken from the seeded admin role."""
    role_id = str(seeded_users["admin"].role.ref.id if hasattr(seeded_users["admin"].role, "ref") else seeded_users["admin"].role.id)
    r = await client.post(
        "/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "New Waiter",
            "email": "newwaiter@zenpos.com",
            "password": "waiterpass",
            "phone": "555-9999",
            "role_id": role_id,
            "base_salary": 2500,
        },
    )
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "New Waiter"
    assert d["email"] == "newwaiter@zenpos.com"


async def test_create_user_duplicate_email(client: AsyncClient, admin_token: str, seeded_users):
    role_id = str(seeded_users["admin"].role.ref.id if hasattr(seeded_users["admin"].role, "ref") else seeded_users["admin"].role.id)
    await client.post(
        "/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Dup",
            "email": "dup@zenpos.com",
            "password": "pass",
            "phone": "",
            "role_id": role_id,
        },
    )
    r = await client.post(
        "/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Dup2",
            "email": "dup@zenpos.com",
            "password": "pass",
            "phone": "",
            "role_id": role_id,
        },
    )
    assert r.status_code == 409


async def test_update_user(client: AsyncClient, admin_token: str, admin_user_id: str):
    r = await client.patch(
        f"/users/{admin_user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"phone": "555-1234"},
    )
    assert r.status_code == 200
    assert r.json()["phone"] == "555-1234"


async def test_deactivate_user(client: AsyncClient, admin_token: str, seeded_users):
    """Deactivate the cook user — should disappear from active list."""
    role_id = str(seeded_users["cook"].role.ref.id if hasattr(seeded_users["cook"].role, "ref") else seeded_users["cook"].role.id)
    # Create a throwaway user
    create = await client.post(
        "/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Throwaway",
            "email": "throwaway@zenpos.com",
            "password": "pass",
            "phone": "",
            "role_id": role_id,
        },
    )
    uid = create.json()["id"]
    r = await client.delete(
        f"/users/{uid}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 204
    # Should not appear in active list
    listing = await client.get("/users/")
    ids = [u["id"] for u in listing.json()]
    assert uid not in ids
