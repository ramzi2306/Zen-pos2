import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.main import app
import app.database as _db
from app.models.user import UserDocument, RoleDocument
from app.models.product import ProductDocument, CategoryDocument
from app.models.order import OrderDocument
from app.models.attendance import AttendanceRecordDocument
from app.models.payroll import PayrollWithdrawalDocument, PerformanceLogDocument
from app.models.token import RefreshTokenDocument
from app.models.ingredient import IngredientInventoryDocument, PurchaseLogDocument, UsageLogDocument
from app.models.customer import CustomerDocument
from app.models.settings import BrandingDocument, LocalizationDocument, IntegrationDocument
from app.models.location import LocationDocument
from app.core.security import hash_password

TEST_MONGO_URL = "mongodb://localhost:27017"
TEST_DB_NAME = "zenpos_test"


@pytest_asyncio.fixture(autouse=True, scope="session")
async def setup_test_db():
    motor_client = AsyncIOMotorClient(TEST_MONGO_URL, tz_aware=True)
    await init_beanie(
        database=motor_client[TEST_DB_NAME],
        document_models=[
            RoleDocument, UserDocument, CategoryDocument, ProductDocument,
            OrderDocument, AttendanceRecordDocument,
            PayrollWithdrawalDocument, PerformanceLogDocument, RefreshTokenDocument,
            IngredientInventoryDocument, PurchaseLogDocument, UsageLogDocument,
            CustomerDocument, BrandingDocument, LocalizationDocument,
            IntegrationDocument, LocationDocument,
        ],
    )
    # Prevent the app lifespan from re-initializing Beanie with a different Motor client
    _db._initialized = True
    _db._client = motor_client
    yield
    await motor_client.drop_database(TEST_DB_NAME)
    motor_client.close()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(scope="session")
async def seeded_users(setup_test_db):
    """Create reusable test users once per session (idempotent)."""
    admin_role = await RoleDocument.find_one(RoleDocument.name == "Test Admin")
    if not admin_role:
        admin_role = RoleDocument(name="Test Admin", permissions=[
            "view_menu", "view_orders", "view_attendance", "view_staff",
            "view_hr", "view_inventory", "view_settings", "manage_roles",
        ])
        await admin_role.insert()

    cook_role = await RoleDocument.find_one(RoleDocument.name == "Test Cook")
    if not cook_role:
        cook_role = RoleDocument(name="Test Cook", permissions=["view_orders"])
        await cook_role.insert()

    admin_user = await UserDocument.find_one(UserDocument.email == "testadmin@zenpos.com")
    if not admin_user:
        admin_user = UserDocument(
            name="Test Admin",
            email="testadmin@zenpos.com",
            hashed_password=hash_password("testpass"),
            hashed_pin=hash_password("9876"),
            phone="",
            role=admin_role,
            base_salary=5000,
        )
        await admin_user.insert()

    cook_user = await UserDocument.find_one(UserDocument.email == "testcook@zenpos.com")
    if not cook_user:
        cook_user = UserDocument(
            name="Test Cook",
            email="testcook@zenpos.com",
            hashed_password=hash_password("cookpass"),
            hashed_pin=hash_password("1111"),
            phone="",
            role=cook_role,
            base_salary=3000,
        )
        await cook_user.insert()

    return {"admin": admin_user, "cook": cook_user}


@pytest_asyncio.fixture(scope="session")
async def admin_token(seeded_users) -> str:
    """Session-scoped admin access token — created once, shared across all tests."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/auth/login", json={
            "email": "testadmin@zenpos.com",
            "password": "testpass",
        })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def cook_user_id(seeded_users) -> str:
    return str(seeded_users["cook"].id)


@pytest_asyncio.fixture(scope="session")
async def admin_user_id(seeded_users) -> str:
    return str(seeded_users["admin"].id)
