import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_payroll_summary(client: AsyncClient, admin_token: str, admin_user_id: str):
    r = await client.get(
        f"/payroll/summary/{admin_user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == admin_user_id
    assert data["base_salary"] == 5000
    assert "net_payable" in data
    assert "late_count" in data
    assert "overtime_hours" in data


async def test_payroll_summary_not_found(client: AsyncClient, admin_token: str):
    r = await client.get(
        "/payroll/summary/000000000000000000000000",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_payroll_requires_auth(client: AsyncClient, admin_user_id: str):
    r = await client.get(f"/payroll/summary/{admin_user_id}")
    assert r.status_code == 401


async def test_process_withdrawal(client: AsyncClient, admin_token: str, admin_user_id: str):
    r = await client.post(
        "/payroll/withdraw",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "user_id": admin_user_id,
            "amount": 1000.0,
            "admin_notes": "Mid-month advance",
            "audit_notes": "",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["amount"] == 1000.0
    assert data["status"] in ("Completed", "Pending")


async def test_list_withdrawals(client: AsyncClient, admin_token: str, admin_user_id: str):
    r = await client.get(
        f"/payroll/withdrawals/{admin_user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    # Should contain the withdrawal from the previous test
    assert len(r.json()) >= 1


async def test_create_performance_log(client: AsyncClient, admin_token: str, admin_user_id: str):
    r = await client.post(
        "/payroll/performance-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "user_id": admin_user_id,
            "type": "Reward",
            "title": "Exceptional month",
            "impact": "+$100",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "Reward"
    assert data["impact"] == "+$100"


async def test_performance_log_affects_net(
    client: AsyncClient, admin_token: str, admin_user_id: str
):
    """Adding a reward should increase net_payable."""
    before = await client.get(
        f"/payroll/summary/{admin_user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    net_before = before.json()["net_payable"]

    await client.post(
        "/payroll/performance-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"user_id": admin_user_id, "type": "Reward", "title": "Bonus", "impact": "+$200"},
    )

    after = await client.get(
        f"/payroll/summary/{admin_user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert after.json()["net_payable"] > net_before
