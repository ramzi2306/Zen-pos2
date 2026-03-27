import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_check_in_unknown_user(client: AsyncClient):
    """Check-in with a non-existent user_id must return 404."""
    r = await client.post("/attendance/check-in", json={
        "user_id": "000000000000000000000000",
        "pin": "9999",
    })
    assert r.status_code == 404


async def test_today_records_requires_auth(client: AsyncClient):
    r = await client.get("/attendance/today")
    assert r.status_code == 401


async def test_check_in_wrong_pin(client: AsyncClient, admin_user_id: str):
    """Correct user_id but wrong PIN must return 401."""
    r = await client.post("/attendance/check-in", json={
        "user_id": admin_user_id,
        "pin": "0000",   # correct PIN is 9876
    })
    assert r.status_code == 401


async def test_check_in_and_out_full_cycle(
    client: AsyncClient,
    admin_user_id: str,
    admin_token: str,
):
    """Full check-in / check-out cycle."""
    # Check in
    ci = await client.post("/attendance/check-in", json={
        "user_id": admin_user_id,
        "pin": "9876",
    })
    assert ci.status_code == 200
    record = ci.json()
    assert record["user_id"] == admin_user_id
    assert record["check_in"] is not None
    assert record["check_out"] is None
    record_id = record["id"]

    # Check out
    co = await client.post("/attendance/check-out", json={
        "user_id": admin_user_id,
        "pin": "9876",
    })
    assert co.status_code == 200
    assert co.json()["check_out"] is not None

    # Record appears in today's list
    today = await client.get(
        "/attendance/today",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert today.status_code == 200
    ids = [r["id"] for r in today.json()]
    assert record_id in ids


async def test_report_requires_auth(client: AsyncClient):
    r = await client.get("/attendance/report?start_date=2024-01-01&end_date=2024-01-31")
    assert r.status_code == 401


async def test_report_returns_structure(client: AsyncClient, admin_token: str):
    r = await client.get(
        "/attendance/report?start_date=2024-01-01&end_date=2024-01-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "start_date" in data
    assert "end_date" in data
    assert "summaries" in data
