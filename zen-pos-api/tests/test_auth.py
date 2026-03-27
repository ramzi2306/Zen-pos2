import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_login_success(client: AsyncClient, admin_token: str):
    assert admin_token is not None
    assert len(admin_token) > 10


async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post("/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrongpass",
    })
    assert response.status_code == 401


async def test_get_me(client: AsyncClient, admin_token: str):
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "testadmin@zenpos.com"
    assert "permissions" in data


async def test_get_me_no_token(client: AsyncClient):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_refresh_token(client: AsyncClient):
    from app.core.security import hash_password
    from app.models.user import UserDocument, RoleDocument

    role = await RoleDocument.find_one(RoleDocument.name == "Test Admin")
    user = UserDocument(
        name="Refresh Test",
        email="refresh@zenpos.com",
        hashed_password=hash_password("pass"),
        phone="",
        role=role,
    )
    await user.insert()

    login_resp = await client.post("/auth/login", json={
        "email": "refresh@zenpos.com",
        "password": "pass",
    })
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    refresh_resp = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.json()
